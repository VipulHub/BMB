import type { Request, Response } from "express";
import Razorpay from "razorpay";
import supabase from "../../config/db.config.ts";
import { env } from "../../config/envConfig.ts";
import { AppError } from "../../types/express-error.ts";
import { emitter } from "../../utils/emiter.ts";
import type { CreateOrderRequest, CreateOrderResponse, VerifyPaymentRequest, VerifyPaymentResponse } from "./types.ts";
import crypto from "crypto";
import { createDelhiveryShipment, type ShipmentData } from "../helper.ts";
const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

async function createOrder(
  req: Request<any, any, CreateOrderRequest>,
  res: Response<CreateOrderResponse>
): Promise<Response<CreateOrderResponse>> {
  try {
    const { customer, address, payment_method, cart, userId } = req.body;

    /* 1️⃣ FETCH USER */
    const { data: user, error: userFetchError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (userFetchError) throw userFetchError;
    if (!user) return res.status(404).json({ errorCode: "USER_NOT_FOUND", error: "User does not exist." });

    /* 2️⃣ UPDATE USER */
    const { error: userUpdateError } = await supabase
      .from("users")
      .update({ name: `${customer.first_name} ${customer.last_name}`, email: customer.email })
      .eq("id", user.id);
    if (userUpdateError) throw userUpdateError;

    /* 3️⃣ UPSERT DEFAULT ADDRESS */
    const { data: existingAddress } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("is_default", true)
      .maybeSingle();

    if (existingAddress) {
      await supabase.from("user_addresses").update({
        full_name: `${customer.first_name} ${customer.last_name}`,
        address_line1: address.address_line,
        address_line2: address.locality || null,
        city: address.city,
        state: address.state,
        country: address.country,
        postal_code: address.pincode,
      }).eq("id", existingAddress.id);
    } else {
      await supabase.from("user_addresses").insert({
        user_id: user.id,
        full_name: `${customer.first_name} ${customer.last_name}`,
        address_line1: address.address_line,
        address_line2: address.locality || null,
        city: address.city,
        state: address.state,
        country: address.country,
        postal_code: address.pincode,
        is_active: true,
        is_default: true,
      });
    }

    /* 4️⃣ CREATE RAZORPAY ORDER */
    const totalAmount = cart.total;
    const razorpayOrder = await razorpay.orders.create({
      amount: totalAmount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      payment_capture: true,
    });

    /* 5️⃣ CREATE ORDER IN DB */
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        status: "pending",
        total_amount: totalAmount,
        payment_method_id: null,
        razorpay_order_id: razorpayOrder.id
      })
      .select("*")
      .single();
    if (orderError) throw orderError;

    /* 6️⃣ PAYMENT HISTORY */
    await supabase.from("order_payment_history").insert({
      order_id: orderData.id,
      amount: totalAmount,
      method_used: payment_method,
      status: "initiated",
    });

    /* 7️⃣ HANDLE COUPON */
    let appliedCouponId: string | null = null;
    if (cart.couponId) {
      const { data: coupon } = await supabase
        .from("discount_coupons")
        .select("id")
        .eq("coupon_code", cart.couponId)
        .eq("is_active", true)
        .maybeSingle();
      if (coupon) {
        appliedCouponId = coupon.id;
        await supabase.from("discount_coupons").update({ is_active: false }).eq("id", coupon.id);
      }
    }

    /* 8️⃣ RESPONSE */
    return res.status(200).json({
      errorCode: "NO_ERROR",
      data: {
        order_id: orderData.id,
        razorpay_order_id: razorpayOrder.id,
        amount: totalAmount,
        currency: "INR",
        customer,
        address,
        couponId: appliedCouponId,
      },
    });
  } catch (e) {
    console.error("CreateOrder error:", e);
    const error = e as AppError;
    const orgError = new AppError(error.stack, error.message, 500, createOrder.name, "Server Error");
    emitter.emit("error", {
      msg: orgError.message,
      stack: orgError.stack!,
      level: orgError.level,
      code: orgError.statusCode,
      methodName: createOrder.name,
    });
    return res.status(orgError.statusCode).json({ errorCode: "Server_Error", error: orgError.message });
  }
}


async function verifyRazorpayPayment(
  req: Request<any, any, VerifyPaymentRequest>,
  res: Response<VerifyPaymentResponse>
): Promise<Response<VerifyPaymentResponse>> {
  try {
    const {
      order_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    /* =========================
       1️⃣ FETCH ORDER
    ========================= */
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order)
      return res.status(404).json({ errorCode: "ORDER_NOT_FOUND", error: "Order not found" });

    /* =========================
       2️⃣ FETCH METHOD_USED FOR HARDCODE PRIPADE
    ========================= */
    const { data: orderHistory, error: historyError } = await supabase
      .from("order_payment_history")
      .select("method_used")
      .eq("order_id", order_id)
      .maybeSingle();

    if (historyError) throw historyError;

    const methodUsed = orderHistory?.method_used ?? "Prepaid"; // fallback to Prepaid
    console.log("Method used for hardcode pripade:", methodUsed);

    /* =========================
       3️⃣ VERIFY RAZORPAY SIGNATURE
    ========================= */
    const bodyStr = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(bodyStr)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await supabase
        .from("order_payment_history")
        .update({ status: "failed" })
        .eq("order_id", order_id);

      return res.status(400).json({
        errorCode: "INVALID_SIGNATURE",
        error: "Payment verification failed",
      });
    }

    /* =========================
       4️⃣ UPDATE ORDER + PAYMENT HISTORY
    ========================= */
    await supabase
      .from("orders")
      .update({ status: "paid", razorpay_payment_id })
      .eq("id", order_id);

    await supabase
      .from("order_payment_history")
      .update({ status: "success" })
      .eq("order_id", order_id);

    /* =========================
       5️⃣ FETCH USER
    ========================= */
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, name, phone_number")
      .eq("id", order.user_id)
      .single();

    if (userError) throw userError;

    /* =========================
       6️⃣ FETCH USER ADDRESS
    ========================= */
    let { data: address } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", order.user_id)
      .eq("is_active", true)
      .eq("is_default", true)
      .maybeSingle();

    // fallback → latest active address
    if (!address) {
      const fallback = await supabase
        .from("user_addresses")
        .select("*")
        .eq("user_id", order.user_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      address = fallback.data ?? null;
    }

    if (!address) throw new Error("No active address found for user");

    /* =========================
       7️⃣ BUILD DELHIVERY PAYLOAD
    ========================= */
    const shipmentPayload: ShipmentData = {
      name: address.full_name || user.name,
      phone: (address.phone_number || user.phone_number || "").replace(/\D/g, "").slice(-10),
      add: `${address.address_line1} ${address.address_line2 ?? ""}`.replace(/[\/]/g, "").trim(),
      country: address.country,
      pin: address.postal_code,
      order: `Order_${order.id}`,
      payment_mode: methodUsed === "COD" ? "COD" : "Prepaid",
      total_amount: Number(order.total_amount),
    };

    /* =========================
       8️⃣ CREATE DELHIVERY SHIPMENT
    ========================= */
    const shipmentRes = await createDelhiveryShipment(shipmentPayload);

    const pkg = shipmentRes?.packages?.[0];
    if (pkg?.waybill) {
      await supabase
        .from("orders")
        .update({ status: "shipped" })
        .eq("id", order_id);

      await supabase.from("shipping_details").insert({
        order_id,
        status: pkg.status ?? "created",
        location: pkg.sort_code ?? "",
        tracking_number: pkg.waybill,
      });
    }

    /* =========================
       9️⃣ RESPONSE
    ========================= */
    return res.status(200).json({
      errorCode: "NO_ERROR",
      data: {
        order_id,
        payment_id: razorpay_payment_id,
        status: "paid",
      },
    });
  } catch (e) {
    console.error("VerifyPayment error:", e);
    const error = e as Error;

    return res.status(500).json({
      errorCode: "Server_Error",
      error: error.message,
    });
  }
}


export { createOrder, verifyRazorpayPayment };

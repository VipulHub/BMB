import type { Request, Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";

import supabase from "../../config/db.config.ts";
import { env } from "../../config/envConfig.ts";

import type {
  CreateOrderRequest,
  CreateOrderResponse,
  GetAllOrdersResponse,
  VerifyPaymentRequest,
} from "./types.ts";

import {
  createDelhiveryShipment,
  getDelhiveryShipmentStatus,
  type ShipmentData,
} from "../helper.ts";

/* =========================================================
   RAZORPAY INIT
========================================================= */

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

/* =========================================================
   CREATE ORDER
========================================================= */

async function createOrder(
  req: Request<any, any, CreateOrderRequest>,
  res: Response<CreateOrderResponse>
) {
  try {
    const { customer, address, payment_method, cart, userId } = req.body;

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("session_id", userId)
      .maybeSingle();

    if (!user) {
      return res.status(404).json({
        errorCode: "USER_NOT_FOUND",
        error: "User does not exist",
      });
    }

    /* ---------- UPDATE USER ---------- */
    await supabase
      .from("users")
      .update({
        name: `${customer.first_name} ${customer.last_name}`,
        email: customer.email,
      })
      .eq("id", user.id);

    /* ---------- ADDRESS ---------- */
    const { data: existingAddress } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .maybeSingle();

    if (existingAddress) {
      await supabase
        .from("user_addresses")
        .update({
          full_name: `${customer.first_name} ${customer.last_name}`,
          address_line1: address.address_line,
          address_line2: address.locality ?? null,
          city: address.city,
          state: address.state,
          country: address.country,
          postal_code: address.pincode,
        })
        .eq("id", existingAddress.id);
    } else {
      await supabase.from("user_addresses").insert({
        user_id: user.id,
        full_name: `${customer.first_name} ${customer.last_name}`,
        address_line1: address.address_line,
        address_line2: address.locality ?? null,
        city: address.city,
        state: address.state,
        country: address.country,
        postal_code: address.pincode,
        is_active: true,
        is_default: true,
      });
    }

    /* ---------- RAZORPAY ORDER ---------- */
    const razorpayOrder = await razorpay.orders.create({
      amount: cart.total * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      payment_capture: true,
    });

    /* ---------- DB ORDER ---------- */
    const { data: order } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        status: "pending",
        total_amount: cart.total,
        razorpay_order_id: razorpayOrder.id,
      })
      .select("*")
      .single();

    await supabase.from("order_payment_history").insert({
      order_id: order.id,
      amount: cart.total,
      method_used: payment_method,
      status: "initiated",
    });

    return res.status(200).json({
      errorCode: "NO_ERROR",
      data: {
        order_id: order.id,
        razorpay_order_id: razorpayOrder.id,
        amount: cart.total,
        currency: "INR",
      },
    });
  } catch (e: any) {
    return res.status(500).json({
      errorCode: "SERVER_ERROR",
      error: e.message,
    });
  }
}

/* =========================================================
   VERIFY PAYMENT + CREATE SHIPMENT
========================================================= */

async function verifyRazorpayPayment(
  req: Request<any, any, VerifyPaymentRequest>,
  res: Response
) {
  try {
    const {
      order_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    /* ---------- ORDER ---------- */
    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (!order) {
      return res.status(404).json({
        errorCode: "ORDER_NOT_FOUND",
        error: "Order not found",
      });
    }

    /* ---------- PAYMENT ---------- */
    const { data: payment } = await supabase
      .from("order_payment_history")
      .select("*")
      .eq("order_id", order_id)
      .single();

    if (!payment) {
      return res.status(404).json({
        errorCode: "PAYMENT_NOT_FOUND",
        error: "Payment record missing",
      });
    }

    const methodUsed = payment.method_used;

    /* ---------- VERIFY ONLINE ---------- */
    if (methodUsed === "ONLINE") {
      const body = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expectedSignature = crypto
        .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
        .update(body)
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

      await supabase
        .from("orders")
        .update({
          status: "paid",
          razorpay_payment_id,
        })
        .eq("id", order_id);

      await supabase
        .from("order_payment_history")
        .update({ status: "success" })
        .eq("order_id", order_id);
    }

    /* ---------- COD ---------- */
    if (methodUsed === "COD") {
      await supabase
        .from("orders")
        .update({ status: "cod_confirmed" })
        .eq("id", order_id);

      await supabase
        .from("order_payment_history")
        .update({ status: "pending" })
        .eq("order_id", order_id);
    }

    /* ---------- PREVENT DUPLICATE SHIPMENT ---------- */
    const { data: existingShipment } = await supabase
      .from("shipping_details")
      .select("waybill")
      .eq("order_id", order.id)
      .maybeSingle();

    if (existingShipment) {
      return res.status(200).json({
        errorCode: "NO_ERROR",
        data: {
          order_id: order.id,
          status: order.status,
          waybill: existingShipment.waybill,
        },
      });
    }

    /* ---------- USER ---------- */
    const { data: user } = await supabase
      .from("users")
      .select("name, phone_number")
      .eq("id", order.user_id)
      .single();

    /* ---------- ADDRESS ---------- */
    const { data: address } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", order.user_id)
      .eq("is_default", true)
      .single();

    if (!address) {
      return res.status(400).json({
        errorCode: "ADDRESS_MISSING",
        error: "Default address not found",
      });
    }

    /* ---------- SHIPMENT PAYLOAD ---------- */
    const shipmentPayload: ShipmentData = {
      name: address.full_name || user?.name || "Customer",
      phone: address.phone_number || user?.phone_number || "9999999999",
      add: `${address.address_line1} ${address.address_line2 ?? ""}`.trim(),
      pin: address.postal_code,
      country: address.country,
      order: `ORD_${order.id}`,
      payment_mode: methodUsed === "COD" ? "COD" : "Prepaid",
      total_amount: Number(order.total_amount),
    };

    /* ---------- CREATE DELHIVERY ---------- */
    const shipment = await createDelhiveryShipment(shipmentPayload);

    /* ---------- SAVE SHIPPING ---------- */
    await supabase.from("shipping_details").insert({
      order_id: order.id,
      waybill: shipment.waybill,
      delhivery_order_id: shipment.order_ref,

      consignee_name: shipmentPayload.name,
      phone: shipmentPayload.phone,
      address: shipmentPayload.add,
      pin: shipmentPayload.pin,
      country: shipmentPayload.country,

      payment_mode: shipmentPayload.payment_mode,
      total_amount: shipmentPayload.total_amount,
      cod_amount:
        shipmentPayload.payment_mode === "COD"
          ? shipmentPayload.total_amount
          : 0,

      shipping_mode: "Surface",
      weight: 0.5,
      quantity: 1,
      product_description: "General Merchandise",

      current_status: shipment.status,
      current_location: shipment.sort_code ?? null,
      delhivery_status_code: shipment.status,
      delhivery_response: shipment.raw,
    });

    return res.status(200).json({
      errorCode: "NO_ERROR",
      data: {
        order_id: order.id,
        status: order.status,
        waybill: shipment.waybill,
      },
    });
  } catch (e: any) {
    const message = e.message || "Server error";

    return res.status(500).json({
      errorCode: message.includes("pickup")
        ? "DELHIVERY_PICKUP_CONFIG_ERROR"
        : "SERVER_ERROR",
      error: message,
    });
  }
}

/* =========================================================
   GET ALL ORDERS (WITH LIVE TRACKING)
========================================================= */

async function getAllOrdersByUserId(
  req: Request,
  res: Response<GetAllOrdersResponse>
) {
  try {
    const userId = req.params.userId;

    /* ---------- ORDERS ---------- */
    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (orderError) throw orderError;

    if (!orders || orders.length === 0) {
      return res.status(200).json({
        errorCode: "NO_ERROR",
        data: [],
      });
    }

    const orderIds = orders.map(o => o.id);

    /* ---------- PAYMENTS + SHIPMENTS + ITEMS ---------- */
    const [
      { data: payments },
      { data: shipments },
      { data: orderItems },
    ] = await Promise.all([
      supabase
        .from("order_payment_history")
        .select("*")
        .in("order_id", orderIds),

      supabase
        .from("shipping_details")
        .select("*")
        .in("order_id", orderIds),

      supabase
        .from("order_items")
        .select("order_id, product_id")
        .in("order_id", orderIds),
    ]);

    /* ---------- PRODUCT MAP ---------- */
    const productMap = new Map<string, string[]>();

    (orderItems ?? []).forEach(item => {
      if (!productMap.has(item.order_id)) {
        productMap.set(item.order_id, []);
      }
      productMap.get(item.order_id)!.push(item.product_id);
    });

    /* ---------- LIVE TRACKING ---------- */
    const trackingResults = await Promise.allSettled(
      (shipments ?? [])
        .filter(s => s.waybill)
        .map(async s => ({
          order_id: s.order_id,
          tracking: await getDelhiveryShipmentStatus({
            waybill: s.waybill,
          }),
        }))
    );

    const trackingMap = new Map<string, any>();

    trackingResults.forEach(r => {
      if (r.status === "fulfilled") {
        trackingMap.set(r.value.order_id, r.value.tracking);
      }
    });

    /* ---------- FINAL RESPONSE ---------- */
    const response: GetAllOrdersResponse["data"] = orders.map(order => {
      const payment = payments?.find(p => p.order_id === order.id);
      const shipment = shipments?.find(s => s.order_id === order.id);
      const tracking = trackingMap.get(order.id);
      const products = productMap.get(order.id) ?? [];

      return {
        order_id: order.id,
        created_at: order.created_at,
        order_status: order.status,
        total_amount: Number(order.total_amount),

        /* ✅ REQUIRED BY TYPE */
        product_ids: products,
        product_count: products.length,

        payment: {
          method: payment?.method_used ?? null,
          status: payment?.status ?? null,
          amount: payment?.amount ?? null,
          paid_at: payment?.updated_at ?? null,
          razorpay_payment_id: order.razorpay_payment_id ?? null,
        },

        shipping: {
          status:
            tracking?.Status?.Status ??
            shipment?.current_status ??
            null,

          tracking_number: shipment?.waybill ?? null,

          location:
            tracking?.Status?.Location ??
            shipment?.current_location ??
            null,

          expected_delivery:
            tracking?.ExpectedDeliveryDate ??
            shipment?.expected_delivery ??
            null,
        },
      };
    });

    return res.status(200).json({
      errorCode: "NO_ERROR",
      data: response,
    });
  } catch (e: any) {
    console.error("GET ORDERS ERROR:", e);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
      error: e.message,
    });
  }
}

/* ========================================================= */

export {
  createOrder,
  verifyRazorpayPayment,
  getAllOrdersByUserId,
};

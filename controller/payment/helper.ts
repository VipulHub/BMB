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
      .eq("id", userId)
      .maybeSingle();

    if (!user) {
      return res.status(404).json({
        errorCode: "USER_NOT_FOUND",
        error: "User does not exist",
      });
    }

    await supabase
      .from("users")
      .update({
        name: `${customer.first_name} ${customer.last_name}`,
        email: customer.email,
      })
      .eq("id", user.id);

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

    const razorpayOrder = await razorpay.orders.create({
      amount: cart.total * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      payment_capture: true,
    });

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

    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (!order) {
      return res.status(404).json({ errorCode: "ORDER_NOT_FOUND" });
    }

    const { data: paymentRow } = await supabase
      .from("order_payment_history")
      .select("*")
      .eq("order_id", order_id)
      .single();

    const methodUsed = paymentRow.method_used;

    if (methodUsed === "ONLINE") {
      const body = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expected = crypto
        .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest("hex");

      if (expected !== razorpay_signature) {
        await supabase
          .from("order_payment_history")
          .update({ status: "failed" })
          .eq("order_id", order_id);

        return res.status(400).json({ errorCode: "INVALID_SIGNATURE" });
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

    if (methodUsed === "COD") {
      await supabase
        .from("orders")
        .update({ status: "cod_confirmed" })
        .eq("id", order_id);
    }

    const { data: user } = await supabase
      .from("users")
      .select("name, phone_number")
      .eq("id", order.user_id)
      .single();

    const { data: address } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", order.user_id)
      .eq("is_default", true)
      .single();

    const shipmentPayload: ShipmentData = {
      name: address.full_name || user!.name,
      phone: address.phone_number || user!.phone_number!,
      add: `${address.address_line1} ${address.address_line2 ?? ""}`,
      pin: address.postal_code,
      country: address.country,
      order: `ORD_${order.id}`,
      payment_mode: methodUsed === "COD" ? "COD" : "Prepaid",
      total_amount: Number(order.total_amount),
    };

    const shipment = await createDelhiveryShipment(shipmentPayload);

    await supabase.from("shipping_details").insert({
      order_id: order.id,
      waybill: shipment.waybill,
      delhivery_order_id: shipment.order_ref ?? null,

      consignee_name: shipmentPayload.name,
      phone: shipmentPayload.phone,
      address: shipmentPayload.add,
      pin: shipmentPayload.pin,
      country: shipmentPayload.country,

      payment_mode: shipmentPayload.payment_mode,
      total_amount: shipmentPayload.total_amount,
      cod_amount: shipment.raw?.cod_amount ?? 0,

      current_status: shipment.status,
      current_location: shipment.sort_code ?? null,

      delhivery_status_code: shipment.status,
      delhivery_response: shipment.raw,
    });

    return res.status(200).json({ errorCode: "NO_ERROR" });
  } catch (e: any) {
    return res.status(500).json({
      errorCode: "SERVER_ERROR",
      error: e.message,
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

    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!orders?.length) {
      return res.status(200).json({ errorCode: "NO_ERROR", data: [] });
    }

    const orderIds = orders.map(o => o.id);

    const [{ data: payments }, { data: shipments }] =
      await Promise.all([
        supabase.from("order_payment_history").select("*").in("order_id", orderIds),
        supabase.from("shipping_details").select("*").in("order_id", orderIds),
      ]);

    const trackingResults = await Promise.allSettled(
      (shipments ?? []).filter(s => s.waybill).map(async s => ({
        order_id: s.order_id,
        tracking: await getDelhiveryShipmentStatus({ waybill: s.waybill }),
      }))
    );

    const trackingMap = new Map<string, any>();
    trackingResults.forEach(r => {
      if (r.status === "fulfilled") {
        trackingMap.set(r.value.order_id, r.value.tracking);
      }
    });

    const response = orders.map(order => {
      const payment = payments?.find(p => p.order_id === order.id);
      const shipment = shipments?.find(s => s.order_id === order.id);
      const tracking = trackingMap.get(order.id);

      return {
        order_id: order.id,
        created_at: order.created_at,
        order_status: order.status,
        total_amount: Number(order.total_amount),

        product_ids: order.product_ids ?? [],
        product_count: order.product_count ?? 0,

        payment: {
          method: payment?.method_used ?? null,
          status: payment?.status ?? null,
          amount: payment?.amount ?? null,
          paid_at: payment?.updated_at ?? null,
          razorpay_payment_id: order.razorpay_payment_id ?? null,
        },

        shipping: {
          status: tracking?.Status?.Status ?? shipment?.current_status ?? null,
          tracking_number: shipment?.waybill ?? null,
          location: tracking?.Status?.Location ?? shipment?.current_location ?? null,
          expected_delivery: tracking?.ExpectedDeliveryDate ?? shipment?.expected_delivery ?? null,
        },
      };
    });

    return res.status(200).json({ errorCode: "NO_ERROR", data: response });
  } catch (e: any) {
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

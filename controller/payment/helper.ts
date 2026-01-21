import type { Request, Response } from "express";
import Razorpay from "razorpay";
import supabase from "../../config/db.config.ts";
import { env } from "../../config/envConfig.ts";
import { AppError } from "../../types/express-error.ts";
import { emitter } from "../../utils/emiter.ts";
import type { CreateOrderRequest, CreateOrderResponse } from "./types.ts";

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
    console.log("Request body:", req.body);

    /* -----------------------------
       Fetch user safely
    ----------------------------- */
    const { data: users, error: userFetchError } = await supabase
      .from("users")
      .select("*")
      .or(`id.eq.${userId},email.eq.${customer.email}`)
      .limit(1);

    if (userFetchError) throw userFetchError;

    let user = users?.[0];

    if (!user) {
      // Insert new user if none exists
      const { data: newUser, error: userInsertError } = await supabase
        .from("users")
        .insert({
          name: `${customer.first_name} ${customer.last_name}`,
          email: customer.email,
          address: `${address.address_line}, ${address.locality}, ${address.city}, ${address.state}, ${address.country}, ${address.pincode}`,
        })
        .select("*")
        .single();

      if (userInsertError) throw userInsertError;
      user = newUser;
    } else {
      // Update name & address only
      const { error: userUpdateError } = await supabase
        .from("users")
        .update({
          name: `${customer.first_name} ${customer.last_name}`,
          address: `${address.address_line}, ${address.locality}, ${address.city}, ${address.state}, ${address.country}, ${address.pincode}`,
        })
        .eq("id", user.id);

      if (userUpdateError) throw userUpdateError;
    }

    /* -----------------------------
       Create Razorpay order
    ----------------------------- */
    const totalAmount = cart.total; // INR
    const razorpayOrder = await razorpay.orders.create({
      amount: totalAmount * 100, // paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      payment_capture: true,
    });

    /* -----------------------------
       Insert order into DB
    ----------------------------- */
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          user_id: user.id,
          status: "pending",
          total_amount: totalAmount,
          payment_method_id: null,
        },
      ])
      .select("*")
      .single();

    if (orderError) throw orderError;

    /* -----------------------------
       Insert payment history
    ----------------------------- */
    const { error: paymentError } = await supabase
      .from("order_payment_history")
      .insert([
        {
          order_id: orderData.id,
          amount: totalAmount,
          method_used: payment_method,
          status: "initiated",
        },
      ]);
    if (paymentError) throw paymentError;

    /* -----------------------------
       Handle coupon safely
    ----------------------------- */
    let appliedCouponId: string | null = null;

    if (cart.couponId || cart.couponCode) {
      let couponRow;

      if (cart.couponId) {
        // Try fetching by UUID
        const { data, error } = await supabase
          .from("discount_coupons")
          .select("id")
          .eq("id", cart.couponId)
          .single();

        if (!error && data) couponRow = data;
      }

      if (!couponRow && cart.couponCode) {
        // Fetch by coupon code
        const { data, error } = await supabase
          .from("discount_coupons")
          .select("id")
          .eq("coupon_code", cart.couponCode)
          .single();

        if (!error && data) couponRow = data;
      }

      if (couponRow) {
        appliedCouponId = couponRow.id;
        const { error: couponError } = await supabase
          .from("discount_coupons")
          .update({ is_active: false })
          .eq("id", couponRow.id);
        if (couponError) throw couponError;
      }
    }

    /* -----------------------------
       Return response
    ----------------------------- */
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
    console.log("CreateOrder error:", e);
    const error = e as AppError;

    const orgError = new AppError(
      error.stack,
      error.message,
      500,
      createOrder.name,
      "Server Error"
    );

    emitter.emit("error", {
      msg: orgError.message,
      stack: orgError.stack!,
      level: orgError.level,
      code: orgError.statusCode,
      methodName: createOrder.name,
    });

    return res.status(orgError.statusCode).json({
      errorCode: "Server_Error",
      error: orgError,
    });
  }
}

export { createOrder };

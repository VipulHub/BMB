import Joi from "joi";

export const verifyPaymentSchema = Joi.object({
  order_id: Joi.string().required(),              // your DB order id
  razorpay_order_id: Joi.string().required(),    // Razorpay order id
  razorpay_payment_id: Joi.string().required(),  // Razorpay payment id
  razorpay_signature: Joi.string().required(),   // Signature to verify
});

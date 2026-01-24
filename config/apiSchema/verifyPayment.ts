import Joi from "joi";

export const verifyPaymentSchema = Joi.object({
  order_id: Joi.string().required(),

  razorpay_order_id: Joi.string().optional(),
  razorpay_payment_id: Joi.string().optional(),
  razorpay_signature: Joi.string().optional(),
});

import Joi from "joi";

export const createOrderSchema = Joi.object({
  customer: Joi.object({
    first_name: Joi.string().required(),
    last_name: Joi.string().required(),
    email: Joi.string().email().required(),
  }).required(),
  address: Joi.object({
    address_line: Joi.string().required(),
    locality: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    country: Joi.string().required(),
    pincode: Joi.string().required(),
  }).required(),
  payment_method: Joi.string().valid("ONLINE", "COD").required(),
  cart: Joi.object({
    subtotal: Joi.number().required(),
    discount: Joi.number().required(),
    shipping: Joi.number().required(),
    total: Joi.number().required(),
    couponId: Joi.string().optional().allow(null),
  }).required(),
  userId: Joi.string().uuid().required(),
});

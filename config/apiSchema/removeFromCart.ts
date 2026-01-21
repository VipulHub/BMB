import Joi from "joi";

export const removeFromCartSchema = Joi.object({
    product_id: Joi.string().required(),
    userId: Joi.string().optional(),
    cartId: Joi.string().optional(),
});
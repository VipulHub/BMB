import Joi from "joi";

export const removeFromCartSchema = Joi.object({
    product_id: Joi.string().required(),
    sessionId: Joi.string().required(),
    weight: Joi.string().required(),
    cartId: Joi.string().optional(),
    checkDelete: Joi.boolean().optional(),
});
import Joi from "joi";

export const addToCartSchema = Joi.object({
    product_id: Joi.string().uuid().required(),
    sessionId: Joi.string().required(),
    weight: Joi.string().required(),
    quantity: Joi.number().integer().min(1).default(1),
    userId: Joi.string().optional(),
});
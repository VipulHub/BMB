import Joi from "joi";

export const signUpUserSchema = Joi.object({
    name: Joi.string().min(2).max(100).required(),

    email: Joi.string().email().required(),

    password_hash: Joi.string().min(6).required(),

    type: Joi.string().valid("user", "admin").default("user"),

    phone_number: Joi.string()
        .allow(null)
        .pattern(/^[0-9+\-\s()]{7,20}$/)
        .optional(),

    address: Joi.string().allow(null).optional()
});

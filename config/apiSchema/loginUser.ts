import Joi from "joi";

export const loginUserSchema = Joi.object({
    userId: Joi.string().required(),
    email: Joi.string().optional(),
});

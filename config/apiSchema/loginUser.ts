import Joi from "joi";

export const loginUserSchema = Joi.object({
    number: Joi.number().required(),
});

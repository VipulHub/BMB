import Joi from "joi";

export const otpAuthSchema = Joi.object({
    otp: Joi.number().required(),
});

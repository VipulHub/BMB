import Joi from "joi";

export const createLeadSchema = Joi.object({
  phoneNumber: Joi.string()
    .trim()
    .pattern(/^[0-9+\-\s]{7,15}$/)
    .optional()
    .messages({
      "string.pattern.base": "Phone number is invalid",
    }),

  email: Joi.string().trim().email().optional(),

  sessionId: Joi.string().trim().min(6).max(200).required(),
});

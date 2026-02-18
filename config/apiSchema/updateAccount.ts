import Joi from "joi";
import type { UpdateAccountRequest } from "../../controller/user/types.ts";

export const updateAccountSchema = Joi.object<UpdateAccountRequest>({
    // ✅ operation type
    operation: Joi.string()
        .valid("UPDATE", "DELETE_ADDRESS")
        .default("UPDATE"),

    // ================= PROFILE =================
    firstName: Joi.string().trim().min(1).max(60).allow(""),
    lastName: Joi.string().trim().min(1).max(60).allow(""),
    email: Joi.string()
        .trim()
        .email({ tlds: { allow: false } })
        .allow(""),
    mobile: Joi.string()
        .trim()
        .pattern(/^[0-9+\-\s]{10,20}$/)
        .allow(""),

    // ================= ADDRESS =================
    address: Joi.string().trim().min(1).max(250).allow(""),
    locality: Joi.string().trim().min(1).max(120).allow(""),
    pincode: Joi.string()
        .trim()
        .pattern(/^[0-9]{4,10}$/)
        .allow(""),
    city: Joi.string().trim().min(1).max(80).allow(""),
    state: Joi.string().trim().min(1).max(80).allow(""),
    country: Joi.string().trim().min(1).max(80).allow(""),
})
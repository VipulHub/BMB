import type { envConfigType } from "../types/env.validation.js";
import { envSchema } from "./env.validation.js";
import path from "path";
import dotenv from "dotenv";

// explicitly load the .env file from your project root
dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});


const { error, value } = envSchema.validate(process.env, {
    abortEarly: true,
    allowUnknown: true,
    stripUnknown: false,
}) as {
    error?: Error;
    value: envConfigType;
};

if (error) {
    console.log(error);
    throw error;
}

// ✅ Now no unsafe access
const env = {
    port: value.PORT,
    env: value.ENV,
    SUPABASE_URL: value.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: value.SUPABASE_SERVICE_ROLE_KEY,
    JWTKEY:value.JWTKEY,
    CORS_ORIGINS:value.CORS_ORIGINS,
    TWILIO_ACCOUNT_SID:value.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN:value.TWILIO_AUTH_TOKEN,
    RAZORPAY_KEY_ID:value.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET:value.RAZORPAY_KEY_SECRET,
};

export { env };
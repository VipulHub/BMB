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
    SYSTEM: value.SYSTEM,
    SUPABASE_URL: value.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: value.SUPABASE_SERVICE_ROLE_KEY,
    JWTKEY: value.JWTKEY,
    CORS_ORIGINS: value.CORS_ORIGINS,
    TWILIO_ACCOUNT_SID: value.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: value.TWILIO_AUTH_TOKEN,
    RAZORPAY_KEY_ID: value.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: value.RAZORPAY_KEY_SECRET,
    DELHIVERY_API_KEY: value.DELHIVERY_API_KEY,
    LOCAL_DELHIVERY_URL: value.LOCAL_DELHIVERY_URL,
    PROD_DELHIVERY_URL: value.PROD_DELHIVERY_URL,
     LOCAL_DELHIVERY_TRACK_URL: value.LOCAL_DELHIVERY_TRACK_URL,
    PROD_DELHIVERY_TRACK_URL: value.PROD_DELHIVERY_TRACK_URL,
};

export { env };
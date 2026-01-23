import Joi from 'joi';

// Step 1: Define the validation schema
const envSchema = Joi.object({
  PORT: Joi.number().required(),
  SYSTEM: Joi.string().allow('PROD', 'LOCAL').required(),
  SUPABASE_URL: Joi.string().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  JWTKEY: Joi.string().required(),
  CORS_ORIGINS: Joi.string().required(),
  TWILIO_ACCOUNT_SID: Joi.string().required(),
  TWILIO_AUTH_TOKEN: Joi.string().required(),
  RAZORPAY_KEY_ID: Joi.string().required(),
  RAZORPAY_KEY_SECRET: Joi.string().required(),
  DELHIVERY_API_KEY: Joi.string().required(),
  LOCAL_DELHIVERY_URL: Joi.string().required(),
  PROD_DELHIVERY_URL: Joi.string().required(),
}).unknown(); // allow other env vars to pass through

export {
  envSchema
}
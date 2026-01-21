// Import Twilio SDK
import Twilio from "twilio";
import { env } from "./envConfig.ts";

// Twilio credentials (keep these in .env in production!)
const accountSid: string = env.TWILIO_ACCOUNT_SID;
const authToken: string = env.TWILIO_AUTH_TOKEN;

// Create Twilio client
export const client = Twilio(accountSid, authToken);


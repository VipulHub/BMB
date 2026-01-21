interface envConfigType {
    PORT: string,
    ENV: string,
    SUPABASE_URL: string,
    SUPABASE_SERVICE_ROLE_KEY: string,
    app_base_path: string,
    JWTKEY: string,
    CORS_ORIGINS: string,
    TWILIO_ACCOUNT_SID: string,
    TWILIO_AUTH_TOKEN: string,
    RAZORPAY_KEY_SECRET: string,
    RAZORPAY_KEY_ID: string,
}
export type {
    envConfigType
}

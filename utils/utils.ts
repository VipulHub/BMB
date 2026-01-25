import supabase from "../config/db.config.ts";
import { env } from "../config/envConfig.ts";
import { AppError } from "../types/express-error.ts";
import type { LogLevel, ParsedError } from "../types/globalTypes.ts";
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { v4 as uuidv4 } from "uuid";
import type { Request, Response } from "express";
import type { CartItem } from "../controller/cart/types.ts";
const secret = env.JWTKEY;

async function errorParser(
    error: unknown,
    methodName: string,
    level: LogLevel = 'fatal',
    code: number = 500
): Promise<ParsedError> {
    const isError = error instanceof Error;

    const stack = isError ? error.stack ?? 'No stack trace' : 'No stack trace';
    const message = isError ? error.message ?? 'Error' : String(error);
    const name = isError ? error.name ?? 'Server Error' : 'UnknownError';

    const existingError = await supabase
        .from('app_errors')
        .select('*')
        .eq('stack_trace', stack)
        .eq('method_name', methodName);

    if (!existingError) {
        await supabase
            .from('app_errors')
            .insert([{
                error_message: message,
                method_name: methodName || errorParser.name,
                level,
                stack_trace: stack,
            }]);
    }

    return {
        name,
        method: methodName,
        message,
        stack,
        level,
        code,
    };
}


async function errorGenerator(fnName: string, message: string, code: number = 500, level: LogLevel = 'fatal', method: string = '', stack: string) {
    const error = new AppError();
    error.message = message
    error.name = fnName
    error.level = level
    error.statusCode = code
    error.methodName = method
    error.stack = stack
    return error
}

async function createToken(payload: JwtPayload): Promise<string> {
    return jwt.sign(payload, secret, {
        expiresIn: '24h'
    })
}
async function verifyToken(token: string): Promise<JwtPayload | unknown> {
    try {
        const payload = jwt.verify(token, secret);
        return payload;
    } catch (error) {
        // Token is invalid, expired, or tampered with
        return error;
    }
}

const SESSION_COOKIE_NAME = "SESSION_ID";
const SESSION_DURATION = 1000 * 60 * 60 * 24; // 24 hours in ms

async function ensureGuestSession(req: Request, res: Response): Promise<string> {
    let sessionId = req.cookies?.[SESSION_COOKIE_NAME];

    let createNewSession = false;

    if (sessionId) {
        // Check if session exists in carts table and is not expired
        const { data: cart, error } = await supabase
            .from("carts")
            .select("created_at")
            .eq("session_id", sessionId)
            .single();

        if (error || !cart) {
            // Session doesn't exist in DB → create new
            createNewSession = true;
        } else {
            const createdTime = new Date(cart.created_at).getTime();
            const now = Date.now();

            if (now - createdTime > SESSION_DURATION) {
                // Session expired → create new
                createNewSession = true;
            }
        }
    } else {
        createNewSession = true;
    }

    if (createNewSession) {
        sessionId = uuidv4();

        res.cookie(SESSION_COOKIE_NAME, sessionId, {
            httpOnly: true,
            secure: true,          // ✅ REQUIRED
            sameSite: "none",      // ✅ REQUIRED for Firebase
            maxAge: SESSION_DURATION,
            domain: ".bmbstore.in" // ✅ VERY IMPORTANT
        });

        // Optional: create empty cart in DB for new session
        await supabase.from("carts").insert({
            session_id: sessionId,
            product_ids: [],
            product_count: 0,
        });
    }

    return sessionId;
}

export function normalizeCart(items: CartItem[]) {
    let product_count = 0;
    let total_price = 0;

    const normalized = items.map(item => {
        const itemTotal = item.quantity * item.price;
        product_count += item.quantity;
        total_price += itemTotal;

        return {
            ...item,
            total_price: itemTotal
        };
    });

    return {
        items: normalized,
        product_count,
        total_price
    };
}

export function emptyCart(userId?: string | null, sessionId?: string | null) {
    return {
        id: null,
        created_at: null,
        user_id: userId ?? null,
        session_id: sessionId ?? null,
        items: [],
        product_count: 0,
        total_price: 0
    };
}

function generateOTP(length: number = 6): string {
    if (length <= 0) throw new Error("OTP length must be greater than 0");
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
}
export {
    errorGenerator,
    errorParser,
    createToken,
    verifyToken,
    ensureGuestSession,
    generateOTP
}
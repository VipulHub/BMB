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
const SESSION_DURATION = 1000 * 60 * 60 * 24; // 24 hours

/**
 * ✅ Behavior:
 * 1) If Authorization token exists (Bearer <token>) OR x-auth-token exists:
 *    - DO NOT create a new guest session
 *    - Find user by users.jwt_token = token
 *    - Return user's session_id (if missing -> create one and save to user)
 *    - Also ensure carts row exists for that session_id
 *
 * 2) If no token:
 *    - use cookie session
 *    - create session + user row + cart if missing
 */
 async function ensureGuestSession(req: Request, res: Response): Promise<string> {
  const isLocal = env.SYSTEM === "LOCAL";

  // 🔹 LOCAL cookie options
  const localCookieOptions = {
    maxAge: SESSION_DURATION,
    path: "/",
  };

  // 🔹 PROD cookie options
  const prodCookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    domain: ".bmbstore.com",
    maxAge: SESSION_DURATION,
    path: "/",
  };

  const cookieOptions = isLocal ? localCookieOptions : prodCookieOptions;

  /* ===============================
     helpers
  ================================ */

  const extractToken = (): string | null => {
    const auth = String(req.headers["authorization"] ?? "").trim();
    if (auth.toLowerCase().startsWith("bearer ")) {
      const t = auth.slice(7).trim();
      return t || null;
    }

    // optional fallback header
    const x = String(req.headers["x-auth-token"] ?? "").trim();
    return x || null;
  };

  const ensureCartForSession = async (sid: string) => {
    const { data: cart, error: cartErr } = await supabase
      .from("carts")
      .select("id")
      .eq("session_id", sid)
      .maybeSingle();

    if (cartErr) throw cartErr;

    if (!cart) {
      const { error: insErr } = await supabase.from("carts").insert({
        session_id: sid,
        items: [],
        product_count: 0,
        total_price: 0,
      });
      if (insErr) throw insErr;
    }
  };

  const ensureUserRowForSession = async (sid: string) => {
    const { data: existingUser, error: findErr } = await supabase
      .from("users")
      .select("id")
      .eq("session_id", sid)
      .maybeSingle();

    if (findErr) throw findErr;

    if (!existingUser) {
      const { error: insErr } = await supabase.from("users").insert({
        session_id: sid,
      });

      if (insErr) {
        const msg = insErr.message || "";
        const isDuplicateSession =
          insErr.code === "23505" && msg.includes("users_session_id_key");
        if (!isDuplicateSession) throw insErr;
      }
    } else {
      await supabase
        .from("users")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", existingUser.id);
    }
  };

  /* =========================================================
     ✅ 1) TOKEN PRESENT → USE USER.session_id (NO NEW SESSION)
  ========================================================== */
  const token = extractToken();

  if (token) {
    // Find user by token
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id, session_id, jwt_expires_at")
      .eq("jwt_token", token)
      .maybeSingle();

    if (userErr) throw userErr;

    // If token is present but user not found => treat as guest (OR throw)
    // Choose behavior:
    // - safest for auth: return 401
    // - safest for shopping: fallback to guest session
    //
    // Here: fallback to guest session ONLY if you want public browsing.
    if (!user) {
      // fallback to guest
    } else {
      // Optional expiry check (only if you set jwt_expires_at)
      if (user.jwt_expires_at) {
        const exp = new Date(user.jwt_expires_at).getTime();
        if (Number.isFinite(exp) && exp > 0 && Date.now() > exp) {
          // token expired -> treat as guest (or 401)
          // fallback to guest
        } else {
          // ✅ Use existing session_id if present, otherwise create and save
          let sid = (user.session_id ?? "").trim();

          if (!sid) {
            sid = uuidv4();
            const { error: updErr } = await supabase
              .from("users")
              .update({
                session_id: sid,
                updated_at: new Date().toISOString(),
              })
              .eq("id", user.id);

            if (updErr) throw updErr;
          } else {
            // touch user
            await supabase
              .from("users")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", user.id);
          }

          // ✅ ensure cart exists for session
          await ensureCartForSession(sid);

          // ✅ optionally set cookie to keep FE consistent (recommended)
          res.cookie(SESSION_COOKIE_NAME, sid, cookieOptions);

          return sid;
        }
      } else {
        // no expiry field → just use it
        let sid = (user.session_id ?? "").trim();

        if (!sid) {
          sid = uuidv4();
          const { error: updErr } = await supabase
            .from("users")
            .update({
              session_id: sid,
              updated_at: new Date().toISOString(),
            })
            .eq("id", user.id);

          if (updErr) throw updErr;
        } else {
          await supabase
            .from("users")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", user.id);
        }

        await ensureCartForSession(sid);
        res.cookie(SESSION_COOKIE_NAME, sid, cookieOptions);
        return sid;
      }
    }
  }

  /* =========================================================
     ✅ 2) NO TOKEN → COOKIE SESSION (CREATE IF MISSING)
  ========================================================== */
  let sessionId = String(req.cookies?.[SESSION_COOKIE_NAME] ?? "").trim();

  if (!sessionId) {
    sessionId = uuidv4();
    res.cookie(SESSION_COOKIE_NAME, sessionId, cookieOptions);

    await ensureCartForSession(sessionId);
    await ensureUserRowForSession(sessionId);

    return sessionId;
  }

  await ensureCartForSession(sessionId);
  await ensureUserRowForSession(sessionId);

  return sessionId;
}



export function normalizeCart(items: CartItem[]) {
    const total_price = items.reduce((sum, i) => sum + (i.total_price ?? 0), 0);
    const product_count = items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);
    return { items, total_price, product_count };
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
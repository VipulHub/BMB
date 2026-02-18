import type { NextFunction, Request, Response } from "express";
import { AppError } from "../types/express-error.ts";
import { emitter } from "../utils/emiter.ts";
import supabase from "../config/db.config.ts";
import type Joi from "joi";
import type { JwtPayload } from "jsonwebtoken";
import { verifyToken } from "../utils/utils.ts";
import { log } from "console";

// TODO:: Store IP address and Throw Error without Ip 
// TODO:: Store IP address and Throw Error without Ip
const apiHeartBeat = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {

        const region = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const host =
            request.headers.host ??
            request.hostname ??
            "unknown-host";

        const fullUrl = `${host}${request.baseUrl}${request.path}`;

        emitter.emit("log", {
            msg: `In Region: ${region} | ${request.method} | ${(new Date()).toLocaleTimeString()} | api request ---> ${fullUrl}`,
            level: "info",
        });

        const startTime = Date.now();

        response.on("finish", () => {
            const responseTime = Date.now() - startTime;
            fireAndForgetPulse(request, responseTime, 0);
        });

        next();
    } catch (error) {
        throw error;
    }
};

async function fireAndForgetPulse(request: Request, responseTime: number, attempt = 1) {
    if (attempt > 3) {
        const err = new AppError(
            "Pulse Stream error",
            "Max retries reached",
            500,
            fireAndForgetPulse.name,
            request.method,
            "fatal"
        );

        emitter.emit("error", {
            msg: err.message,
            stack: err.stack!,
            level: err.level,
            code: err.statusCode,
            methodName: err.methodName,
        });

        return err;
    }

    try {
        const { error } = await supabase.from("api_log").insert([
            {
                endpoint: request.originalUrl,
                method: request.method,
                status_code: 200,
                response_time: responseTime,
                ip_address: request.headers.ip || '',
                upload_at: new Date().toISOString(),
            },
        ]);

        if (error) {
            console.error("❌ Failed to log API request in Supabase:", error);
            setTimeout(() => fireAndForgetPulse(request, responseTime, attempt + 1), 200 * attempt);
        }
    } catch (e) {
        const error = e as AppError;

        const orgError = new AppError(
            error.stack,
            error.message,
            500,
            fireAndForgetPulse.name,
            request.method,
            "fatal"
        );

        emitter.emit("error", {
            msg: orgError.message,
            stack: orgError.stack!,
            level: orgError.level,
            code: error.statusCode,
            methodName: error.methodName,
        });

        setTimeout(() => fireAndForgetPulse(request, responseTime, attempt + 1), 200 * attempt);
    }
}

const validate =
    (schema: Joi.Schema) =>
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { error } = schema.validate(req.body, { abortEarly: false });
                if (error) {
                    const message = error.details.map((d) => d.message).join(", ");

                    const orgError = new AppError(
                        error.stack || "",
                        message,
                        400,
                        "ValidationMiddleware",
                        "Server Error"
                    );

                    emitter.emit("error", {
                        msg: orgError.message,
                        stack: orgError.stack!,
                        level: orgError.level,
                        code: orgError.statusCode,
                        methodName: orgError.methodName,
                    });

                    return res.status(orgError.statusCode).json({
                        errorCode: "Server Error",
                        error: orgError,
                    });
                }

                next();
            } catch (e: any) {
                const error = e as AppError;
                const orgError = new AppError(
                    error.stack,
                    error.message,
                    500,
                    "ValidationMiddleware",
                    "Server Error"
                );

                emitter.emit("error", {
                    msg: orgError.message,
                    stack: orgError.stack!,
                    level: orgError.level,
                    code: orgError.statusCode,
                    methodName: orgError.methodName,
                });

                return res.status(orgError.statusCode).json({
                    errorCode: "Server Error",
                    error: orgError,
                });
            }
        };


async function checkAdminToken(
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> {
    try {
        const token = request.headers["token"] as string;

        if (!token) {
            response.status(401).json({
                error: "Missing or invalid Authorization token",
            });
            return;
        }

        // Get user from Supabase Auth
        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data?.user) {
            response.status(401).json({
                error: "Invalid or expired token",
            });
            return;
        }

        const email = data.user.email;

        // Get user role from your custom 'users' table
        const { data: userData, error: userError } = await supabase
            .from("users")
            .select("id, type")
            .eq("email", email)
            .single();

        if (userError || !userData) {
            response.status(401).json({
                error: "User not found in database",
            });
            return;
        }

        // Check if user is admin
        if (userData.type !== "admin") {
            response.status(403).json({
                error: "Access denied. Admins only",
            });
            return;
        }

        // Attach user info to request
        (request as any).user = userData;

        next();
    } catch (err) {
        console.error(err);
        response.status(500).json({
            error: "Server error processing token",
        });
    }
}

async function checkToken(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : undefined;

    const normalizeSessionId = (v: any) => {
      let s = String(v || "").trim();
      if (!s) return "";
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
      }
      try {
        s = decodeURIComponent(s);
      } catch {}
      return s.trim();
    };

    const sessionId = normalizeSessionId(request.cookies?.["SESSION_ID"]);

    console.log(sessionId, "sessionId");
    console.log(bearerToken, "bearerToken");

    // ✅ PRIORITY 1: SESSION AUTH (cookie)
    if (sessionId) {
      const { data: sessionUser, error: sessErr } = await supabase
        .from("users")
        .select("id, session_id")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (!sessErr && sessionUser?.id) {
        // Optional: update last seen (don’t block request if it fails)
        supabase
          .from("users")
          .update({ session_last_seen_at: new Date().toISOString() })
          .eq("id", sessionUser.id);

        (request as any).sessionId = sessionId;
        (request as any).userId = sessionUser.id;
        (request as any).authType = "SESSION";
        next();
        return;
      }

      // If cookie exists but invalid, you can either:
      // A) fail immediately, OR
      // B) fallback to token
      // You asked "priority to sessionId", so I’m doing fallback ONLY if session invalid.
      // If you want to hard-fail on invalid session, uncomment below and remove fallback.
      //
      // response.status(401).json({ error: "Invalid session" });
      // return;
    }

    // ✅ PRIORITY 2: JWT AUTH (fallback)
    if (bearerToken) {
      let decoded: JwtPayload;

      try {
        decoded = (await verifyToken(bearerToken)) as JwtPayload;
      } catch {
        response.status(401).json({ error: "Invalid or expired token" });
        return;
      }

      if (!decoded?.userId) {
        response.status(401).json({ error: "Invalid token payload" });
        return;
      }

      const { data: dbUser, error: dbErr } = await supabase
        .from("users")
        .select("id, jwt_token, jwt_expires_at")
        .eq("id", decoded.userId)
        .maybeSingle();

      if (dbErr || !dbUser) {
        response.status(401).json({ error: "User not found" });
        return;
      }

      if (dbUser.jwt_token && dbUser.jwt_token !== bearerToken) {
        response.status(401).json({ error: "Token revoked" });
        return;
      }

      if (dbUser.jwt_expires_at) {
        const exp = new Date(dbUser.jwt_expires_at).getTime();
        if (exp <= Date.now()) {
          response.status(401).json({ error: "Token expired" });
          return;
        }
      }

      (request as any).userId = decoded.userId;
      (request as any).authType = "JWT";
      next();
      return;
    }

    response.status(401).json({ error: "Missing authentication token" });
  } catch (err) {
    console.error("Auth middleware error:", err);
    response.status(500).json({ error: "Server error processing token" });
  }
}


export {
    apiHeartBeat,
    validate,
    checkAdminToken,
    checkToken
}
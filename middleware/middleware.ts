import type { NextFunction, Request, Response } from "express";
import { AppError } from "../types/express-error.ts";
import { emitter } from "../utils/emiter.ts";
import supabase from "../config/db.config.ts";
import type Joi from "joi";

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
        let token: string | undefined;
        let authType: "SUPABASE" | "SESSION" | null = null;
         const sessionId = request.cookies?.["sessionId"] 
         console.log(sessionId,'yolo');
         
        // 2️⃣ Fallback to cookie-based guest session
        if (!token && sessionId) {
            token = sessionId;
            authType = "SESSION";
        }

        if (!token || !authType) {
            response.status(401).json({
                error: "Missing authentication token",
            });
            return;
        }

        // 🟢 CASE 1: Guest Session (NO Supabase auth)
        if (authType === "SESSION") {
            (request as any).sessionId = token;
            (request as any).authType = "SESSION";
            next();
            return;
        }

        // 🔵 CASE 2: Supabase Auth User
        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data?.user) {
            response.status(401).json({
                error: "Invalid or expired token",
            });
            return;
        }

        (request as any).user = data.user;
        (request as any).authType = "SUPABASE";

        next();
    } catch (err) {
        console.error("Auth middleware error:", err);
        response.status(500).json({
            error: "Server error processing token",
        });
    }
}


export {
    apiHeartBeat,
    validate,
    checkAdminToken,
    checkToken
}
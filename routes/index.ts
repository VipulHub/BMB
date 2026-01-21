import { type Express, urlencoded, json } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { env } from "../config/envConfig.js";
import { centralLoggingEmitter, emitter, toggleEmitter } from "../utils/emiter.ts";
import { AppError } from "../types/express-error.ts";
import { createTables, dropAllTables, seedDatabase } from "../collections/tables.ts";
import type { routeRegistration } from "../types/globalTypes.ts";

import { userRoutes } from "./user/user.ts";
import { productRoutes } from "./products/product.ts";
import { dashboardRoutes } from "./dashboard/dashboard.ts";
import { apiHeartBeat, checkToken } from "../middleware/middleware.ts";
import { cartRoutes } from "./cart/cart.ts";
import { paymentRoutes } from "./payment/payment.ts";

/* ===============================
   ROUTES
================================ */
const routePaths: routeRegistration = [
    { routepath: "/user", router: userRoutes, middlewares: [], authMiddleware: [apiHeartBeat] },
    { routepath: "/product", router: productRoutes, middlewares: [], authMiddleware: [apiHeartBeat] },
    { routepath: "/dashboard", router: dashboardRoutes, middlewares: [], authMiddleware: [apiHeartBeat] },
    { routepath: "/cart", router: cartRoutes, middlewares: [], authMiddleware: [apiHeartBeat] },
    { routepath: "/payment", router: paymentRoutes, middlewares: [], authMiddleware: [apiHeartBeat, checkToken] },
];

/* ===============================
   CORS CONFIG
================================ */
const allowedOrigins = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(",").map(o => o.trim())
    : ["http://localhost:5173"];

const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // Postman / server calls
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "ip",
        'x-session-id'
    ],
};

/* ===============================
   REGISTER APP
================================ */
const registerApp = async (app: Express) => {
    try {
        const port = env.port;

        centralLoggingEmitter();
        await createTables();
        await seedDatabase()
        //   await dropAllTables()
        // -----------------------------
        // GLOBAL CORS (MUST BE FIRST)
        app.use(cors(corsOptions));
        app.use(cookieParser())
        // ✅ Handle all OPTIONS preflight requests BEFORE routes
        app.options(/.*/, cors(corsOptions)); // ✅ fixed

        /* ===============================
           PARSERS
        ================================ */
        app.use(cookieParser());
        app.use(json({ limit: "10mb" }));
        app.use(urlencoded({ extended: true }));

        /* ===============================
           ROUTES
        ================================ */
        for (const routes of routePaths) {
            emitter.emit("log", {
                msg: `Route Path: ${routes.routepath}`,
                level: "info",
            });

            const router = await routes.router(
                ...routes.authMiddleware,
                ...routes.middlewares
            );

            if (router) {
                app.use(routes.routepath, router);
            }
        }

        /* ===============================
           SERVER
        ================================ */
        app.listen(port, () => {
            emitter.emit("log", {
                msg: `🚀 Server running on port: ${port}`,
                level: "info",
            });
        });
    } catch (e) {
        const error = e as AppError;
        const orgError = new AppError(
            error.stack,
            error.message,
            500,
            registerApp.name,
            "Server Error"
        );

        emitter.emit("error", {
            msg: orgError.message,
            stack: orgError.stack!,
            level: orgError.level,
            code: error.statusCode,
            methodName: error.methodName,
        });

        toggleEmitter("off");
    }
};

export default registerApp;

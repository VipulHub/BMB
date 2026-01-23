import { Router, type RequestHandler } from "express"
import { emitter } from "../../utils/emiter.ts";
import { createOrder, verifyRazorpayPayment } from "../../controller/index.ts";
import {  validate } from "../../middleware/middleware.ts";
import { createOrderSchema, verifyPaymentSchema } from "../../config/apiSchema/index.ts";

const paymentRoutes = async (...middlewares: RequestHandler[]) => {
    emitter.emit('log', {
        msg: `Routes Initialize for Payment`,
        level: 'info'
    })
    const route = Router();
    route.post('/createOrder', ...middlewares, validate(createOrderSchema), createOrder)
    route.post('/verify', ...middlewares, validate(verifyPaymentSchema), verifyRazorpayPayment)
    return route;
}

export { paymentRoutes }
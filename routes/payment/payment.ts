import { Router, type RequestHandler } from "express"
import { emitter } from "../../utils/emiter.ts";
import { createOrder } from "../../controller/index.ts";
import { checkToken, validate } from "../../middleware/middleware.ts";
import { createOrderSchema } from "../../config/apiSchema/index.ts";

const paymentRoutes = async (...middlewares: RequestHandler[]) => {
    emitter.emit('log', {
        msg: `Routes Initialize for Payment`,
        level: 'info'
    })
    const route = Router();
    route.post('/createOrder', ...middlewares, validate(createOrderSchema), checkToken, createOrder)
    // route.get('/verifyPayment', ...middlewares, validate(), checkToken, signout)
    return route;
}

export { paymentRoutes }
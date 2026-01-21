import { Router, type RequestHandler } from "express"
import { emitter } from "../../utils/emiter.ts";
import { validate } from "../../middleware/middleware.ts";
import { addToCartSchema, removeFromCartSchema } from "../../config/apiSchema/index.ts";
import { addToCart, removeFromCart } from "../../controller/index.ts";

const cartRoutes = async (...middlewares: RequestHandler[]) => {
    emitter.emit('log', {
        msg: `Routes Initialize for Cart`,
        level: 'info'
    })
    const route = Router();
    route.post('/addToCart', ...middlewares,validate(addToCartSchema),addToCart)
    route.post('/removeFromCart', ...middlewares,validate(removeFromCartSchema),removeFromCart)
    return route;
}

export { cartRoutes }
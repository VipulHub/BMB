import { Router, type RequestHandler } from "express"
import { emitter } from "../../utils/emiter.ts";
import { getAllUsers, loginWithSessionId, otpAuth, signout } from "../../controller/index.ts";
import { checkAdminToken, checkToken, validate } from "../../middleware/middleware.ts";
import { loginUserSchema, otpAuthSchema } from "../../config/apiSchema/index.ts";

const userRoutes = async (...middlewares: RequestHandler[]) => {
    emitter.emit('log', {
        msg: `Routes Initialize for User`,
        level: 'info'
    })
    const route = Router();
    route.get('/getAllUser', ...middlewares, checkAdminToken, getAllUsers)
    route.post('/login', ...middlewares, validate(loginUserSchema), loginWithSessionId)
    route.post('/otpAuth', ...middlewares, validate(otpAuthSchema), otpAuth)
    route.get('/signOut', ...middlewares, checkToken, signout)
    return route;
}

export { userRoutes }
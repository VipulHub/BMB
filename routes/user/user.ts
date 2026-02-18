import { Router, type RequestHandler } from "express"
import { emitter } from "../../utils/emiter.ts";
import { createLead, getAllUsers, loginWithSessionId, otpAuth, signout, updateAccountDetails } from "../../controller/index.ts";
import { checkAdminToken, checkToken, validate } from "../../middleware/middleware.ts";
import { createLeadSchema, loginUserSchema, otpAuthSchema, updateAccountSchema } from "../../config/apiSchema/index.ts";
import { sendEmailController } from "../../utils/email.ts";

const userRoutes = async (...middlewares: RequestHandler[]) => {
    emitter.emit('log', {
        msg: `Routes Initialize for User`,
        level: 'info'
    })
    const route = Router();
    route.get('/getAllUser', ...middlewares, checkAdminToken, getAllUsers)
    route.post('/login', ...middlewares, validate(loginUserSchema), loginWithSessionId)
    route.post('/otpAuth', ...middlewares, validate(otpAuthSchema), otpAuth)
    route.post('/addLead', ...middlewares, validate(createLeadSchema), createLead)
    route.post('/updateAccount', ...middlewares, validate(updateAccountSchema), updateAccountDetails)
    route.get('/signOut', ...middlewares, checkToken, signout)
    route.post('/sendEmail', ...middlewares, sendEmailController)
    return route;
}

export { userRoutes }
import { Router, type RequestHandler } from "express"
import { emitter } from "../../utils/emiter.ts";
import { getDashboard } from "../../controller/index.ts";

const dashboardRoutes = async (...middlewares: RequestHandler[]) => {
    emitter.emit('log', {
        msg: `Routes Initialize for Dashboard`,
        level: 'info'
    })
    const route = Router();
    route.get('/getDashboardData', ...middlewares, getDashboard)
    return route;
}

export { dashboardRoutes }
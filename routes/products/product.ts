import { Router, type RequestHandler } from "express"
import { emitter } from "../../utils/emiter.ts";
import { addProduct, getAllProducts, getAllUsers } from "../../controller/index.ts";
import { checkAdminToken } from "../../middleware/middleware.ts";
import { upload } from "../../utils/multer.ts";

const productRoutes = async (...middlewares: RequestHandler[]) => {
    emitter.emit('log', {
        msg: `Routes Initialize for Products`,
        level: 'info'
    })
    const route = Router();
    route.get('/getAllProducts', ...middlewares, getAllProducts)
    route.post('/addProduct', ...middlewares, upload.array('images', 5), checkAdminToken, addProduct)
    route.post('/deleteProduct', ...middlewares, checkAdminToken,)
    route.post('/updateProduct', ...middlewares, checkAdminToken,)
    route.get('/getProduct', ...middlewares,)

    return route;
}

export { productRoutes }
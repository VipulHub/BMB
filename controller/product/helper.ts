import supabase from "../../config/db.config.ts";
import type { Request, Response } from 'express'
import { AppError } from "../../types/express-error.ts";
import { emitter } from "../../utils/emiter.ts";
import { log } from "console";
import type { AddProductResponse, getProductResponse } from "./types.ts";

async function addProduct(req: Request, res: Response): Promise<Response<AddProductResponse>> {
    try {
        const user_id = req.body.user_id;
        const payload = {
            user_id: user_id ?? null,
            name: req.body.name,
            description: req.body.description ?? null,
            price: req.body.price ?? 0,
            stock: req.body.stock ?? 0,
            product_type: req.body.product_type ?? null,
            image_urls: req.body.image_urls ?? []
        };
        const { data, error } = await supabase.from('products').insert(payload).select().single();
        if (error) return res.status(400).json({ error });
        return res.status(201).json({errorCode:"NO_ERROR"});
    } catch (e) {
        const error = e as AppError;
        const orgError = new AppError(error.stack, error.message, 500, addProduct.name, 'Server Error');
        emitter.emit('error', {
            msg: orgError.message,
            stack: orgError.stack!,
            level: orgError.level,
            code: error.statusCode,
            methodName: error.methodName
        });
        return res.status(orgError.statusCode).json({ errorCode: orgError.message, error: orgError });
    }
}
async function getAllProducts(req: Request, res: Response): Promise<Response<getProductResponse>> {
    try {
        const { data, error } = await supabase.from('products').select('*');
        if (error) return res.status(400).json({ errorCode: 'Server_Error', error });
        return res.json({ errorCode: 'NO_ERROR', data: data });
    } catch (e) {
        const error = e as AppError;
        const orgError = new AppError(error.stack, error.message, 500, getAllProducts.name, 'Server Error');
        emitter.emit('error', {
            msg: orgError.message,
            stack: orgError.stack!,
            level: orgError.level,
            code: error.statusCode,
            methodName: error.methodName
        });
        return res.status(orgError.statusCode).json({ errorCode: orgError.message, error: orgError });
    }
}

export {
    addProduct,
    getAllProducts
}
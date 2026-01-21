import supabase from "../../config/db.config.ts";
import type { Request, Response } from "express";

import { emptyCart, ensureGuestSession, normalizeCart } from "../../utils/utils.ts";
import type { AddToCartRequest, CartAPIResponse, CartItem, RemoveFromCartRequest } from "./types.ts";

/* ===============================
   ADD TO CART
================================ */
export async function addToCart(
  req: Request<{}, {}, AddToCartRequest>,
  res: Response<CartAPIResponse>
) {
  try {
    const { product_id, quantity = 1, userId } = req.body;
    const sessionId =
      req.cookies.SESSION_ID ?? (await ensureGuestSession(req, res));

    // Fetch price once
    const { data: product } = await supabase
      .from("products")
      .select("price")
      .eq("id", product_id)
      .single();

    if (!product) {
      return res.status(400).json({ errorCode: "Product_Not_Found" });
    }

    const price = Number(product.price);

    // Fetch cart
    const query = supabase.from("carts").select("*");
    userId ? query.eq("user_id", userId) : query.eq("session_id", sessionId);
    const { data: cart } = await query.maybeSingle();

    // Create cart
    if (!cart) {
      const items: CartItem[] = [{
        product_id,
        quantity,
        price,
        total_price: price * quantity
      }];

      const { data } = await supabase
        .from("carts")
        .insert({
          user_id: userId ?? null,
          session_id: sessionId,
          items,
          product_count: quantity,
          total_price: price * quantity
        })
        .select("*")
        .single();

      return res.json({ errorCode: "NO_ERROR", cart: data });
    }

    let items: CartItem[] = Array.isArray(cart.items) ? cart.items : [];
    const existing = items.find(i => i.product_id === product_id);

    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({
        product_id,
        quantity,
        price,
        total_price: price * quantity
      });
    }

    const normalized = normalizeCart(items);

    const { data: updatedCart } = await supabase
      .from("carts")
      .update(normalized)
      .eq("id", cart.id)
      .select("*")
      .single();

    return res.json({ errorCode: "NO_ERROR", cart: updatedCart });
  } catch (e) {
    return res.status(500).json({ errorCode: "Server_Error", error: e });
  }
}


/* ===============================
   REMOVE FROM CART
================================ */
export async function removeFromCart(
  req: Request<{}, {}, RemoveFromCartRequest>,
  res: Response<CartAPIResponse>
) {
  try {
    const { product_id, userId, cartId } = req.body;
    const sessionId = req.cookies.SESSION_ID;

    /* ===============================
       FETCH CART
    ================================ */
    let cartQuery = supabase.from("carts").select("*");

    if (cartId) {
      cartQuery = cartQuery.eq("id", cartId);
    } else if (userId) {
      cartQuery = cartQuery.eq("user_id", userId);
    } else {
      cartQuery = cartQuery.eq("session_id", sessionId);
    }

    const { data: cart } = await cartQuery.maybeSingle();

    if (!cart) {
      return res.json({
        errorCode: "NO_ERROR",
        cart: emptyCart(userId, sessionId),
      });
    }

    /* ===============================
       NO PRODUCT ID → RETURN CART
    ================================ */
    if (!product_id) {
      return res.json({
        errorCode: "NO_ERROR",
        cart,
      });
    }

    let items: CartItem[] = cart.items ?? [];

    /* =================================================
       cartId PRESENT → REMOVE PRODUCT COMPLETELY
    ================================================== */
    if (cartId) {
      items = items.filter(i => i.product_id !== product_id);
    } 
    /* =================================================
       NO cartId → DECREASE QUANTITY BY 1
    ================================================== */
    else {
      const item = items.find(i => i.product_id === product_id);
      if (!item) {
        return res.json({ errorCode: "NO_ERROR", cart });
      }

      item.quantity -= 1;
      items = items.filter(i => i.quantity > 0);
    }

    /* ===============================
       CART EMPTY → DELETE CART
    ================================ */
    if (!items.length) {
      await supabase.from("carts").delete().eq("id", cart.id);
      return res.json({
        errorCode: "NO_ERROR",
        cart: emptyCart(userId, sessionId),
      });
    }

    /* ===============================
       UPDATE CART
    ================================ */
    const normalized = normalizeCart(items);

    const { data: updatedCart } = await supabase
      .from("carts")
      .update(normalized)
      .eq("id", cart.id)
      .select("*")
      .single();

    return res.json({
      errorCode: "NO_ERROR",
      cart: updatedCart,
    });
  } catch (e) {
    return res.status(500).json({
      errorCode: "Server_Error",
      error: e,
    });
  }
}



import supabase from "../../config/db.config.ts";
import type { Request, Response } from "express";

import {
  emptyCart,
  ensureGuestSession,
  normalizeCart,
} from "../../utils/utils.ts";

import type {
  AddToCartRequest,
  CartAPIResponse,
  CartItem,
  RemoveFromCartRequest,
} from "./types.ts";

/* ===============================
   ADD TO CART
================================ */
export async function addToCart(
  req: Request<{}, {}, AddToCartRequest>,
  res: Response<CartAPIResponse>
) {
  try {
    const { product_id, quantity = 1, userId, weight } = req.body;

    const sessionId =
      req.body.sessionId ?? (await ensureGuestSession(req, res));

    /* ===============================
       FETCH PRODUCT
    ================================ */
    const { data: product } = await supabase
      .from("products")
      .select("sizes, size_prices, discounted_prices")
      .eq("id", product_id)
      .single();

    if (!product) {
      return res.status(400).json({ errorCode: "Product_Not_Found" });
    }

    /* ===============================
       AUTO-SELECT DEFAULT SIZE
    ================================ */
    const size =
      Array.isArray(product.sizes) && product.sizes.length
        ? product.sizes[0]
        : null;

    if (!size) {
      return res.status(400).json({ errorCode: "NO_PRODUCT_SIZE" });
    }

    const discountedPrice =
      product.discounted_prices?.[size] ?? null;

    const basePrice =
      product.size_prices?.[size] ?? null;

    const price = Number(discountedPrice ?? basePrice);

    if (!price) {
      return res.status(400).json({ errorCode: "INVALID_PRODUCT_PRICE" });
    }

    /* ===============================
       FETCH CART
    ================================ */
    const query = supabase.from("carts").select("*");
    userId
      ? query.eq("user_id", userId)
      : query.eq("session_id", sessionId);

    const { data: cart } = await query.maybeSingle();

    /* ===============================
       CREATE CART
    ================================ */

    if (!cart) {
      const items: CartItem[] = [
        {
          product_id,
          quantity,
          price,
          total_price: price * quantity,
          total_weight: weight
        },
      ];

      const { data } = await supabase
        .from("carts")
        .insert({
          user_id: userId ?? null,
          session_id: sessionId,
          items,
          product_count: quantity,
          total_price: price * quantity,
        })
        .select("*")
        .single();

      return res.json({ errorCode: "NO_ERROR", cart: data });
    }

    /* ===============================
       UPDATE CART
    ================================ */
    let items: CartItem[] = Array.isArray(cart.items) ? cart.items : [];

    const existing = items.find(
      (i) => i.product_id === product_id
    );

    if (existing) {
      existing.quantity += quantity;
      existing.total_price = existing.quantity * existing.price;
    } else {
      items.push({
        product_id,
        quantity,
        price,
        total_price: price * quantity,
        total_weight: weight, // ← fix here
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
    return res.status(500).json({
      errorCode: "Server_Error",
      error: e,
    });
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
    const { product_id, userId, cartId, sessionId } = req.body;

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

    if (!product_id) {
      return res.json({
        errorCode: "NO_ERROR",
        cart,
      });
    }

    let items: CartItem[] = cart.items ?? [];

    /* =================================================
       cartId PRESENT → REMOVE COMPLETELY
    ================================================== */
    if (cartId) {
      items = items.filter(
        (i) => i.product_id !== product_id
      );
    }
    /* =================================================
       NO cartId → DECREASE QUANTITY
    ================================================== */
    else {
      const item = items.find(
        (i) => i.product_id === product_id
      );

      if (!item) {
        return res.json({ errorCode: "NO_ERROR", cart });
      }

      item.quantity -= 1;
      item.total_price = item.quantity * item.price;

      items = items.filter((i) => i.quantity > 0);
    }

    /* ===============================
       CART EMPTY → DELETE
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

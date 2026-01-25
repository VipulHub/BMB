import supabase from "../../config/db.config.ts";
import type { Request, Response } from "express";

import {
  emptyCart,
  normalizeCart,
} from "../../utils/utils.ts";

import type {
  AddToCartRequest,
  CartAPIResponse,
  CartItem,
  RemoveFromCartRequest,
} from "./types.ts";
import type { Cart } from "../dashboard/types.ts";



/* ===============================
   ADD TO CART
================================ */
export async function addToCart(
  req: Request<{}, {}, AddToCartRequest>,
  res: Response<{ errorCode: string; cart?: Cart }>
) {
  try {
    const { product_id, quantity = 1, weight, userId, sessionId } = req.body;

    if (!weight) return res.status(400).json({ errorCode: "WEIGHT_REQUIRED" });

    // Fetch product
    const { data: product } = await supabase
      .from("products")
      .select("sizes, size_prices, discounted_prices")
      .eq("id", product_id)
      .single();

    if (!product) return res.status(400).json({ errorCode: "Product_Not_Found" });
    if (!product.sizes?.includes(weight)) return res.status(400).json({ errorCode: "INVALID_WEIGHT" });

    const discountedPrice = product.discounted_prices?.[weight] ?? null;
    const basePrice = product.size_prices?.[weight] ?? null;
    const price = Number(discountedPrice ?? basePrice);

    if (!price) return res.status(400).json({ errorCode: "INVALID_PRODUCT_PRICE" });

    // Fetch existing cart
    const query = supabase.from("carts").select("*");
    userId ? query.eq("user_id", userId) : query.eq("session_id", sessionId);
    const { data: cart } = await query.maybeSingle();

    // If cart doesn't exist, create
    if (!cart) {
      const items: CartItem[] = [
        { product_id, size: weight, quantity, price, total_price: price * quantity }
      ];
      const { data: newCart } = await supabase
        .from("carts")
        .insert({
          user_id: userId ?? null,
          session_id: sessionId,
          items,
          total_price: price * quantity,
          product_count: quantity
        })
        .select("*")
        .single();

      return res.json({ errorCode: "NO_ERROR", cart: newCart });
    }

    // Update existing cart
    let items: CartItem[] = Array.isArray(cart.items) ? cart.items : [];

    // Check if product + weight exists
    const existing = items.find(i => i.product_id === product_id && i.size === weight);
    if (existing) {
      existing.quantity += quantity;
      existing.total_price = existing.quantity * existing.price;
    } else {
      items.push({ product_id, size: weight, quantity, price, total_price: price * quantity });
    }

    // Normalize totals for all items
    const normalized = normalizeCart(items);

    const { data: updatedCart } = await supabase
      .from("carts")
      .update(normalized)
      .eq("id", cart.id)
      .select("*")
      .single();

    return res.json({ errorCode: "NO_ERROR", cart: updatedCart });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ errorCode: "Server_Error" });
  }
}

/* ===============================
   REMOVE FROM CART
================================ */
export async function removeFromCart(
  req: Request<{}, {}, RemoveFromCartRequest & { size?: string }>,
  res: Response<CartAPIResponse>
) {
  try {
    const { product_id, userId, cartId, sessionId, size } = req.body;

    // Fetch cart
    let cartQuery = supabase.from("carts").select("*");
    if (cartId) cartQuery = cartQuery.eq("id", cartId);
    else if (userId) cartQuery = cartQuery.eq("user_id", userId);
    else cartQuery = cartQuery.eq("session_id", sessionId);

    const { data: cart } = await cartQuery.maybeSingle();
    if (!cart) return res.json({ errorCode: "NO_ERROR", cart: emptyCart(userId, sessionId) });

    let items: CartItem[] = cart.items ?? [];

    if (!product_id) return res.json({ errorCode: "NO_ERROR", cart });

    // Decrease quantity for specific product + size
    const item = items.find(i => i.product_id === product_id && (!size || i.size === size));
    if (!item) return res.json({ errorCode: "NO_ERROR", cart });

    item.quantity -= 1;
    item.total_price = item.quantity * item.price;

    // Remove items with quantity <= 0
    items = items.filter(i => i.quantity > 0);

    // Delete cart if empty
    if (!items.length) {
      await supabase.from("carts").delete().eq("id", cart.id);
      return res.json({ errorCode: "NO_ERROR", cart: emptyCart(userId, sessionId) });
    }

    // Update cart
    const normalized = normalizeCart(items);
    const { data: updatedCart } = await supabase
      .from("carts")
      .update(normalized)
      .eq("id", cart.id)
      .select("*")
      .single();

    return res.json({ errorCode: "NO_ERROR", cart: updatedCart });
  } catch (e) {
    console.error("removeFromCart error:", e);
    return res.status(500).json({ errorCode: "Server_Error", error: e });
  }
}

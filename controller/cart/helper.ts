import supabase from "../../config/db.config.ts";
import type { Request, Response } from "express";

import { emptyCart, normalizeCart } from "../../utils/utils.ts";

import type {
  AddToCartRequest,
  CartAPIResponse,
  CartItem,
  RemoveFromCartRequest,
} from "./types.ts";

/* ===============================
   HELPERS
================================ */

async function enrichCartItems(items: CartItem[]): Promise<CartItem[]> {
  if (!items.length) return [];

  const productIds = [...new Set(items.map(i => i.product_id))];

  const { data: products } = await supabase
    .from("products")
    .select("id, name, product_type, image_urls, size_prices, discounted_prices")
    .in("id", productIds);

  const productMap = new Map(
    (products ?? []).map(p => [p.id, p])
  );

  return items.map(item => {
    const product = productMap.get(item.product_id);

    const originalPrice =
      product?.size_prices?.[item.size!] ?? item.price;

    return {
      ...item,
      product_name: product?.name ?? "",
      product_type: product?.product_type ?? "",
      product_image: product?.image_urls?.[0] ?? "",
      originalPrice,
      total_original_price: originalPrice * item.quantity,
    };
  });
}

/* ===============================
   ADD TO CART
================================ */
export async function addToCart(
  req: Request<{}, {}, AddToCartRequest>,
  res: Response<CartAPIResponse>
) {
  try {
    const { product_id, quantity = 1, weight, userId, sessionId } = req.body;

    if (!weight) {
      return res.status(400).json({ errorCode: "WEIGHT_REQUIRED" });
    }

    // ---------- FETCH PRODUCT ----------
    const { data: product } = await supabase
      .from("products")
      .select("sizes, size_prices, discounted_prices")
      .eq("id", product_id)
      .single();

    if (!product) {
      return res.status(400).json({ errorCode: "PRODUCT_NOT_FOUND" });
    }

    if (!product.sizes?.includes(weight)) {
      return res.status(400).json({ errorCode: "INVALID_WEIGHT" });
    }

    const price =
      product.discounted_prices?.[weight] ??
      product.size_prices?.[weight];

    if (!price) {
      return res.status(400).json({ errorCode: "INVALID_PRODUCT_PRICE" });
    }

    // ---------- FETCH CART ----------
    let cartQuery = supabase.from("carts").select("*");
    userId
      ? cartQuery.eq("user_id", userId)
      : cartQuery.eq("session_id", sessionId);

    const { data: cart } = await cartQuery.maybeSingle();

    let items: CartItem[] = Array.isArray(cart?.items) ? cart!.items : [];

    const existing = items.find(
      i => i.product_id === product_id && i.size === weight
    );

    if (existing) {
      existing.quantity += quantity;
      existing.total_price = existing.quantity * existing.price;
    } else {
      items.push({
        product_id,
        size: weight,
        quantity,
        price,
        total_price: price * quantity,
      });
    }

    const normalized = normalizeCart(items);

    let updatedCart;

    if (!cart) {
      const { data } = await supabase
        .from("carts")
        .insert({
          user_id: userId ?? null,
          session_id: sessionId,
          ...normalized,
        })
        .select("*")
        .single();

      updatedCart = data;
    } else {
      const { data } = await supabase
        .from("carts")
        .update(normalized)
        .eq("id", cart.id)
        .select("*")
        .single();

      updatedCart = data;
    }

    updatedCart.items = await enrichCartItems(updatedCart.items);

    return res.json({
      errorCode: "NO_ERROR",
      cart: updatedCart,
    });
  } catch (e) {
    console.error("addToCart error:", e);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
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
    const { product_id, cartId, sessionId, weight, checkDelete } = req.body;

    if (!cartId && !sessionId) {
      return res.json({
        errorCode: "NO_ERROR",
        cart: emptyCart(sessionId),
      });
    }

    let cartQuery = supabase.from("carts").select("*");
    cartId
      ? cartQuery.eq("id", cartId)
      : cartQuery.eq("session_id", sessionId);

    const { data: cart } = await cartQuery.maybeSingle();

    if (!cart) {
      return res.json({
        errorCode: "NO_ERROR",
        cart: emptyCart(sessionId),
      });
    }

    let items: CartItem[] = Array.isArray(cart.items) ? cart.items : [];

    const index = items.findIndex(
      i => i.product_id === product_id && i.size === weight
    );

    if (index === -1) {
      return res.json({ errorCode: "NO_ERROR", cart });
    }

    if (checkDelete || items[index]!.quantity <= 1) {
      items.splice(index, 1);
    } else {
      items[index]!.quantity -= 1;
      items[index]!.total_price =
        items[index]!.quantity * items[index]!.price;
    }

    if (!items.length) {
      await supabase.from("carts").delete().eq("id", cart.id);
      return res.json({
        errorCode: "NO_ERROR",
        cart: emptyCart(sessionId),
      });
    }

    const normalized = normalizeCart(items);

    const { data: updatedCart } = await supabase
      .from("carts")
      .update(normalized)
      .eq("id", cart.id)
      .select("*")
      .single();

    updatedCart.items = await enrichCartItems(updatedCart.items);

    return res.json({
      errorCode: "NO_ERROR",
      cart: updatedCart,
    });
  } catch (e) {
    console.error("removeFromCart error:", e);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
}

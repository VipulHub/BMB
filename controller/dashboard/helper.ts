import supabase from "../../config/db.config.ts";
import type { Request, Response } from "express";
import { AppError } from "../../types/express-error.ts";
import { emitter } from "../../utils/emiter.ts";
import { ensureGuestSession } from "../../utils/utils.ts";

import type {
  GetDashboardResponse,
  Product,
  Blog,
  Cart,
  CartItem,
  Coupon
} from "./types.ts";

async function getDashboard(
  req: Request,
  res: Response<GetDashboardResponse>
): Promise<Response<GetDashboardResponse>> {
  try {
    /* ================= SESSION ================= */
    const sessionId = await ensureGuestSession(req, res);
    req.headers["x-session-id"] = sessionId;

    /* ================= CART ================= */
    let { data: cart } = await supabase
      .from("carts")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!cart) {
      const { data: newCart } = await supabase
        .from("carts")
        .insert({
          session_id: sessionId,
          items: [],
          product_count: 0,
          total_price: 0
        })
        .select("*")
        .single();

      cart = newCart!;
    }

    const rawItems = Array.isArray(cart.items) ? cart.items : [];

    /* ================= CART TOTALS ================= */
    let product_count = 0;
    let total_price = 0;

    const recalculatedItems = rawItems.map((item: any) => {
      const itemTotal = item.quantity * item.price;
      product_count += item.quantity;
      total_price += itemTotal;

      return {
        ...item,
        total_price: itemTotal,
        total_original_price: item.originalPrice
          ? item.originalPrice * item.quantity
          : itemTotal
      };
    });

    if (
      product_count !== cart.product_count ||
      total_price !== cart.total_price
    ) {
      const { data: updatedCart } = await supabase
        .from("carts")
        .update({
          items: recalculatedItems,
          product_count,
          total_price,
          updated_at: new Date().toISOString()
        })
        .eq("id", cart.id)
        .select("*")
        .single();

      cart = updatedCart!;
    }

    /* ================= PRODUCTS ================= */
    const { data: rawProducts } = await supabase
      .from("products")
      .select("*")
      .order("priority", { ascending: false });

    const products: Product[] = (rawProducts ?? []).map((p: any) => ({
      id: p.id,
      created_at: p.created_at,
      user_id: p.user_id,
      name: p.name,
      description: p.description,
      stock: p.stock,
      product_type: p.product_type,
      image_urls: p.image_urls ?? [],
      sizes: p.sizes,
      size_prices: p.size_prices,
      discounted_prices: p.discounted_prices,
      priority: p.priority,
      price:
        p.discounted_prices?.["227gm"] ??
        Object.values(p.discounted_prices ?? {})[0] ??
        Object.values(p.size_prices ?? {})[0] ??
        0
    }));

    const productMap = new Map(products.map(p => [p.id, p]));

    /* ================= LEGACY CART ================= */
    const legacyItems: CartItem[] = recalculatedItems.map((item: any) => {
      const product = productMap.get(item.product_id);

      return {
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price,
        total_price: item.total_price,
        product_name: product?.name ?? null,
        product_image: product?.image_urls?.[0] ?? null,
        product_type: product?.product_type ?? null
      };
    });

    const legacyCart: Cart = {
      id: cart.id,
      created_at: cart.created_at,
      user_id: cart.user_id,
      session_id: cart.session_id,
      items: legacyItems,
      product_count,
      total_price
    };

    /* ================= NEW CART (v2, weight/size-aware) ================= */
    const apiCart: Cart = {
      id: cart.id,
      created_at: cart.created_at,
      user_id: cart.user_id,
      session_id: cart.session_id,
      items: recalculatedItems.map((item: any) => {
        const product = productMap.get(item.product_id);
        return {
          ...item,
          product_name: product?.name ?? null,
          product_image: product?.image_urls?.[0] ?? null,
          product_type: product?.product_type ?? null
        };
      }),
      product_count,
      total_price
    };

    /* ================= BLOGS ================= */
    const { data: rawBlogs } = await supabase
      .from("blogs")
      .select("id, created_at, user_id, header, paragraph1, image_urls");

    const blogs: Blog[] = (rawBlogs ?? []).map((b: any) => ({
      id: b.id,
      created_at: b.created_at,
      user_id: b.user_id,
      header: b.header,
      details: b.paragraph1 ?? "",
      image_urls: b.image_urls ?? []
    }));

    /* ================= COUPONS ================= */
    const today = new Date().toISOString().split("T")[0];

    const { data: rawCoupons } = await supabase
      .from("discount_coupons")
      .select("*")
      .eq("is_active", true)
      .lte("valid_from", today)
      .gte("valid_to", today);

    const cartProductIds = new Set(
      legacyCart.items.map(i => i.product_id)
    );

    const coupons: Coupon[] = (rawCoupons ?? []).map((c: any) => ({
      id: c.id,
      code: c.coupon_code,
      discount_percent: c.discount_percent,
      valid_from: c.valid_from,
      valid_to: c.valid_to,
      product_id: c.product_id ?? null,
      product_type: c.product_type ?? null,
      applicable_to_cart:
        (!c.product_id || cartProductIds.has(c.product_id)) &&
        (!c.product_type ||
          legacyCart.items.some(i => i.product_type === c.product_type))
    }));

    /* ================= FINAL RESPONSE ================= */
    return res.status(200).json({
      errorCode: "NO_ERROR",
      data: {
        products,
        blogs,
        cart: legacyCart, // old
        cart_v2: apiCart, // new, enriched with product_name, image, type
        cartCount: product_count,
        coupons
      },
      sessionId
    });
  } catch (e) {
    const error = e as AppError;

    emitter.emit("error", {
      msg: error.message,
      stack: error.stack!,
      level: "error",
      code: 500,
      methodName: getDashboard.name
    });

    return res.status(500).json({
      errorCode: "Server_Error",
      error
    });
  }
}

export { getDashboard };

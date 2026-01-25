import supabase from "../../config/db.config.ts";
import type { Request, Response } from "express";
import { AppError } from "../../types/express-error.ts";
import { emitter } from "../../utils/emiter.ts";
import type {
  GetDashboardResponse,
  Product,
  Blog,
  Cart,
  CartItem,
  Coupon
} from "./types.ts";
import { ensureGuestSession } from "../../utils/utils.ts";

async function getDashboard(
  req: Request,
  res: Response<GetDashboardResponse>
): Promise<Response<GetDashboardResponse>> {
  try {
    /* ---------------- SESSION ---------------- */
    const sessionId = await ensureGuestSession(req, res);
    req.headers["x-session-id"] = sessionId;

    /* ---------------- CART ---------------- */
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

    let items: CartItem[] = Array.isArray(cart.items)
      ? (cart.items as CartItem[])
      : [];

    let product_count = 0;
    let total_price = 0;

    items = items.map((item) => {
      const itemTotal = item.quantity * item.price;
      product_count += item.quantity;
      total_price += itemTotal;
      return { ...item, total_price: itemTotal };
    });

    /* Sync cart totals */
    if (
      product_count !== cart.product_count ||
      total_price !== cart.total_price
    ) {
      const { data: updatedCart } = await supabase
        .from("carts")
        .update({
          items,
          product_count,
          total_price,
          updated_at: new Date().toISOString()
        })
        .eq("id", cart.id)
        .select("*")
        .single();

      cart = updatedCart!;
    }

    /* ---------------- PRODUCTS ---------------- */
    const { data: rawProducts, error: productError } = await supabase
      .from("products")
      .select("*")
      .order("priority", { ascending: false });

    if (productError) {
      return res.status(400).json({
        errorCode: "Server_Error",
        error: productError
      });
    }

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
        p.discounted_prices && Object.values(p.discounted_prices).length > 0
          ? Number(Object.values(p.discounted_prices)[0])
          : p.size_prices && Object.values(p.size_prices).length > 0
          ? Number(Object.values(p.size_prices)[0])
          : 0
    }));

    const productMap = new Map(
      products.map((p) => [String(p.id), p])
    );

    /* ---------------- ENRICH CART ITEMS ---------------- */
    const enrichedItems: CartItem[] = items.map((item) => {
      const product = productMap.get(String(item.product_id));
      return {
        ...item,
        product_name: product?.name ?? null,
        product_image: product?.image_urls?.[0] ?? null,
        product_type: product?.product_type ?? null
      };
    });

    cart.items = enrichedItems;

    /* ---------------- BLOGS ---------------- */
    const { data: rawBlogs, error: blogError } = await supabase
      .from("blogs")
      .select("id, created_at, user_id, header, paragraph1, image_urls");

    if (blogError) {
      return res.status(400).json({
        errorCode: "Server_Error",
        error: blogError
      });
    }

    const blogs: Blog[] = (rawBlogs ?? []).map((b: any) => ({
      id: b.id,
      created_at: b.created_at,
      user_id: b.user_id,
      header: b.header,
      details: b.paragraph1 ?? "",
      image_urls: b.image_urls ?? []
    }));

    /* ---------------- COUPONS ---------------- */
    const today = new Date().toISOString().split("T")[0];

    const { data: rawCoupons } = await supabase
      .from("discount_coupons")
      .select("*")
      .eq("is_active", true)
      .lte("valid_from", today)
      .gte("valid_to", today);

    const cartProductIds = new Set(
      cart.items.map((i: { product_id: any; }) => String(i.product_id))
    );

    const coupons: Coupon[] = (rawCoupons ?? []).map((c: any) => {
      const applicableToProduct =
        !c.product_id || cartProductIds.has(String(c.product_id));

      const applicableToType =
        !c.product_type ||
        cart.items.some(
          (i: CartItem) => i.product_type === c.product_type
        );

      return {
        id: c.id,
        code: c.coupon_code,
        discount_percent: c.discount_percent,
        valid_from: c.valid_from,
        valid_to: c.valid_to,
        product_id: c.product_id ?? null,
        product_type: c.product_type ?? null,
        applicable_to_cart: applicableToProduct && applicableToType
      };
    });

    /* ---------------- FINAL RESPONSE ---------------- */
    return res.status(200).json({
      errorCode: "NO_ERROR",
      data: {
        products,
        blogs,
        cart,
        cartCount: cart.product_count, // 👈 DASHBOARD COUNT
        coupons
      },
      sessionId
    });
  } catch (e) {
    const error = e as AppError;

    emitter.emit("error", {
      msg: error.message,
      stack: error.stack!,
      level: 'error',
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

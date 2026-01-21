import supabase from "../../config/db.config.ts";
import type { Request, Response } from "express";
import { AppError } from "../../types/express-error.ts";
import { emitter } from "../../utils/emiter.ts";
import type { GetDashboardResponse } from "./types.ts";
import { ensureGuestSession } from "../../utils/utils.ts";
import type { CartItem } from "../cart/types.ts";

async function getDashboard(
  req: Request,
  res: Response<GetDashboardResponse>
): Promise<Response<GetDashboardResponse>> {
  try {
    /* -----------------------------
       Ensure Guest Session
    ----------------------------- */
    const sessionId = await ensureGuestSession(req, res);
    req.headers["x-session-id"] = sessionId;

    /* -----------------------------
       Fetch or Create Cart
    ----------------------------- */
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
          total_price: 0,
        })
        .select("*")
        .single();

      cart = newCart;
    }

    /* -----------------------------
       Normalize Cart
    ----------------------------- */
    let items: CartItem[] = Array.isArray(cart.items)
      ? (cart.items as CartItem[])
      : [];

    let product_count = 0;
    let total_price = 0;

    items = items.map((item) => {
      const itemTotal = item.quantity * item.price;
      product_count += item.quantity;
      total_price += itemTotal;

      return {
        ...item,
        total_price: itemTotal,
      };
    });

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
        })
        .eq("id", cart.id)
        .select("*")
        .single();

      if (updatedCart) cart = updatedCart;
    }

    /* -----------------------------
       Fetch Products
    ----------------------------- */
    const { data: products, error: productError } = await supabase
      .from("products")
      .select(`
        id,
        created_at,
        user_id,
        name,
        description,
        price,
        stock,
        product_type,
        image_urls
      `);

    if (productError) {
      return res.status(400).json({
        errorCode: "Server_Error",
        error: productError,
      });
    }

    const productMap = new Map(
      (products ?? []).map((p) => [String(p.id), p])
    );

    const enrichedCartItems = items.map((item) => {
      const product = productMap.get(String(item.product_id));
      return {
        ...item,
        product_name: product?.name ?? null,
        product_image: product?.image_urls?.[0] ?? null,
        product_type: product?.product_type ?? null,
      };
    });

    cart.items = enrichedCartItems;

    /* -----------------------------
       Fetch Blogs
    ----------------------------- */
    const { data: rawBlogs, error: blogError } = await supabase
      .from("blogs")
      .select(`
        id,
        created_at,
        user_id,
        header,
        subheader1,
        paragraph1,
        subheader2,
        paragraph2,
        image_urls
      `);

    if (blogError) {
      return res.status(400).json({
        errorCode: "Server_Error",
        error: blogError,
      });
    }

    const blogs = (rawBlogs ?? []).map((b) => ({
      id: b.id,
      created_at: b.created_at,
      user_id: b.user_id,
      header: b.header,
      details: [
        b.subheader1,
        b.paragraph1,
        b.subheader2,
        b.paragraph2,
      ]
        .filter(Boolean)
        .join("\n\n"),
      image_urls: b.image_urls ?? [],
    }));

    /* -----------------------------
       Fetch ACTIVE COUPONS (Frontend Ready)
    ----------------------------- */
    const today = new Date().toISOString().split("T")[0];

    const { data: rawCoupons } = await supabase
      .from("discount_coupons")
      .select(`
        id,
        coupon_code,
        title,
        description,
        discount_percent,
        valid_from,
        valid_to,
        product_id,
        product_type,
        is_active
      `)
      .eq("is_active", true)
      .lte("valid_from", today)
      .gte("valid_to", today);

    const cartProductIds = new Set(
      (cart.items ?? []).map((i: { product_id: any }) => String(i.product_id))
    );

    const coupons = (rawCoupons ?? []).map((c) => {
      const applicableToProduct =
        !c.product_id || cartProductIds.has(String(c.product_id));

      const applicableToType =
        !c.product_type ||
        cart.items?.some((i: any) => i.product_type === c.product_type);

      return {
        id: c.id,
        code: c.coupon_code,
        title: c.title,            // 👈 added title
        description: c.description, // 👈 added description
        discount_percent: c.discount_percent,
        valid_from: c.valid_from,
        valid_to: c.valid_to,
        product_id: c.product_id,
        product_type: c.product_type,
        applicable_to_cart: applicableToProduct && applicableToType,
      };
    });

    /* -----------------------------
       Final Dashboard Response
    ----------------------------- */
    return res.status(200).json({
      errorCode: "NO_ERROR",
      data: {
        products: products ?? [],
        blogs,
        cart: cart ?? { items: [], product_count: 0, total_price: 0 },
        coupons,
      },
    });
  } catch (e) {
    const error = e as AppError;

    const orgError = new AppError(
      error.stack,
      error.message,
      500,
      getDashboard.name,
      "Server Error"
    );

    emitter.emit("error", {
      msg: orgError.message,
      stack: orgError.stack!,
      level: orgError.level,
      code: orgError.statusCode,
      methodName: getDashboard.name,
    });

    return res.status(orgError.statusCode).json({
      errorCode: "Server_Error",
      error: orgError,
    });
  }
}

export { getDashboard };

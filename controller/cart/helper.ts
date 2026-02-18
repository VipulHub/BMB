import supabase from "../../config/db.config.ts";
import type { Request, Response } from "express";

import { emptyCart, normalizeCart } from "../../utils/utils.ts";

import type {
  AddToCartRequest,
  CartAPIResponse,
  CartItem,
  RemoveFromCartRequest,
} from "./types.ts";

/* =========================================================
   HELPERS
========================================================= */

async function enrichCartItems(items: CartItem[]): Promise<CartItem[]> {
  if (!items.length) return [];

  const productIds = [...new Set(items.map((i) => i.product_id))];

  const { data: products } = await supabase
    .from("products")
    .select("id, name, product_type, image_urls, size_prices, discounted_prices")
    .in("id", productIds);

  const productMap = new Map((products ?? []).map((p: any) => [p.id, p]));

  return items.map((item: any) => {
    const product = productMap.get(item.product_id);

    const baseRupee =
      item.base_price != null && Number(item.base_price) > 0
        ? Number(item.base_price)
        : undefined;

    const originalRupee =
      baseRupee ??
      product?.size_prices?.[item.size!] ??
      (item.originalPrice != null ? Number(item.originalPrice) / 100 : undefined) ??
      Number(item.price) / 100;

    const originalPaise = rupeesInt(originalRupee);

    return {
      ...item,
      product_name: product?.name ?? "",
      product_type: product?.product_type ?? "",
      product_image: product?.image_urls?.[0] ?? "",

      total_price: lineTotalRupees(Number(item.price), Number(item.quantity)),

      originalPrice: originalPaise,
      total_original_price: lineTotalRupees(originalPaise, Number(item.quantity)),

      offer_id: item.offer_id ?? undefined,
    };
  });
}

function rupeesInt(v: unknown): number {
  const n = Number(v ?? 0);
  return Math.round(n);
}

function lineTotalRupees(unit: unknown, qty: unknown): number {
  return rupeesInt(Number(unit ?? 0) * Number(qty ?? 0));
}

function yyyyMMdd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * ✅ ORDER ID FORMAT: YYYYMMDDXXXXX
 * Example: 2026021000001
 *
 * Best practice is DB-side atomic generator (RPC).
 * This code:
 * 1) tries RPC: next_order_id(date_text)
 * 2) fallback: reads latest for today and increments
 */
async function generateOrderId(): Promise<string> {
  const today = yyyyMMdd();

  // (1) RPC (recommended)
  const { data: rpcData, error: rpcErr } = await supabase.rpc("next_order_id", {
    date_text: today,
  });

  if (!rpcErr && rpcData && typeof rpcData === "string") {
    return rpcData; // already formatted
  }

  // (2) fallback
  const { data: latest, error } = await supabase
    .from("orders")
    .select("order_id")
    .like("order_id", `${today}%`)
    .order("order_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return `${today}${String(1).padStart(5, "0")}`;

  const last = (latest?.order_id as string | undefined) ?? "";
  const lastSeq = last.startsWith(today) ? Number(last.slice(8)) : 0;
  const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;

  return `${today}${String(nextSeq).padStart(5, "0")}`;
}

/* ===============================
   ADD TO CART
================================ */
export async function addToCart(
  req: Request<{}, {}, AddToCartRequest>,
  res: Response<CartAPIResponse>
) {
  try {
    const { product_id, quantity = 1, weight, userId, sessionId, offerId } = req.body;
    console.log(sessionId);
    
    if (!weight) return res.status(400).json({ errorCode: "WEIGHT_REQUIRED" });
    if (!userId && !sessionId) return res.status(400).json({ errorCode: "CART_OWNER_REQUIRED" });

    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("sizes, size_prices, discounted_prices")
      .eq("id", product_id)
      .single();

    if (productErr || !product) return res.status(400).json({ errorCode: "PRODUCT_NOT_FOUND" });
    if (!product.sizes?.includes(weight)) return res.status(400).json({ errorCode: "INVALID_WEIGHT" });

    const baseRupee = product.discounted_prices?.[weight] ?? product.size_prices?.[weight];
    if (baseRupee == null) return res.status(400).json({ errorCode: "INVALID_PRODUCT_PRICE" });

    let cartQuery = supabase.from("carts").select("*");
    cartQuery = userId ? cartQuery.eq("user_id", userId) : cartQuery.eq("session_id", sessionId);

    const { data: cart, error: cartErr } = await cartQuery.maybeSingle();
    if (cartErr) return res.status(500).json({ errorCode: "SERVER_ERROR" });

    const items: any[] = Array.isArray(cart?.items) ? [...cart.items] : [];

    let unitRupee = Number(baseRupee);
    let discountPercent = 0;

    if (offerId) {
      const alreadyOfferExistsJson = items.some(
        (i: any) => i.product_id === product_id && i.size === weight && i.offer_id === offerId
      );

      if (!alreadyOfferExistsJson && cart?.id) {
        const { data: existingOfferRow, error: existingOfferRowErr } = await supabase
          .from("cart_items")
          .select("id")
          .eq("cart_id", cart.id)
          .eq("product_id", product_id)
          .eq("selected_size", weight)
          .eq("offer_id", offerId)
          .maybeSingle();

        if (existingOfferRowErr) return res.status(500).json({ errorCode: "SERVER_ERROR" });

        if (existingOfferRow) {
          const safeItems = await enrichCartItems(items as any);
          const enrichedCart = { ...cart, items: safeItems } as any;
          enrichedCart.total_price = rupeesInt(enrichedCart.total_price);
          return res.json({ errorCode: "NO_ERROR", cart: enrichedCart });
        }
      }

      if (alreadyOfferExistsJson) {
        const safeItems = await enrichCartItems(items as any);
        const enrichedCart = { ...cart, items: safeItems } as any;
        enrichedCart.total_price = rupeesInt(enrichedCart.total_price);
        return res.json({ errorCode: "NO_ERROR", cart: enrichedCart });
      }

      const { data: offer, error: offerErr } = await supabase
        .from("product_offers")
        .select("id, product_id, discount_percent, min_quantity, is_active")
        .eq("id", offerId)
        .maybeSingle();

      if (offerErr || !offer || offer.product_id !== product_id || offer.is_active !== true) {
        return res.status(400).json({ errorCode: "OFFER_INVALID" });
      }

      if (quantity < (offer.min_quantity ?? 1)) {
        return res.status(400).json({ errorCode: "OFFER_MIN_QTY_NOT_MET" });
      }

      discountPercent = Number(offer.discount_percent ?? 0);
      unitRupee = Number(baseRupee) * (1 - discountPercent / 100);
    }

    const unitPrice = rupeesInt(unitRupee);

    const existing = items.find((i: any) => {
      const sameCore = i.product_id === product_id && i.size === weight;
      if (!sameCore) return false;
      if (offerId) return false;
      return !i.offer_id;
    });

    if (existing) {
      existing.quantity += quantity;
      existing.price = unitPrice;
      existing.total_price = lineTotalRupees(unitPrice, existing.quantity);
    } else {
      items.push({
        product_id,
        size: weight,
        quantity,
        price: unitPrice,
        total_price: lineTotalRupees(unitPrice, quantity),
        ...(offerId
          ? {
              offer_id: offerId,
              base_price: rupeesInt(baseRupee),
              discount_percent: discountPercent,
            }
          : {}),
      });
    }

    const normalized = normalizeCart(items);

    normalized.items = (normalized.items ?? []).map((it: any) => ({
      ...it,
      price: rupeesInt(it.price),
      total_price: rupeesInt(it.total_price),
    }));
    normalized.total_price = rupeesInt(normalized.total_price);

    let updatedCart: any;

    if (!cart) {
      const { data, error } = await supabase
        .from("carts")
        .insert({
          user_id: userId ?? null,
          session_id: sessionId ?? null,
          ...normalized,
        })
        .select("*")
        .single();

      if (error || !data) return res.status(500).json({ errorCode: "SERVER_ERROR" });
      updatedCart = data;
    } else {
      const { data, error } = await supabase
        .from("carts")
        .update({
          ...normalized,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cart.id)
        .select("*")
        .single();

      if (error || !data) return res.status(500).json({ errorCode: "SERVER_ERROR" });
      updatedCart = data;
    }

    // persist cart_items row
    {
      const cartId = updatedCart.id;

      if (offerId) {
        const { data: row, error: rowErr } = await supabase
          .from("cart_items")
          .select("id")
          .eq("cart_id", cartId)
          .eq("product_id", product_id)
          .eq("selected_size", weight)
          .eq("offer_id", offerId)
          .maybeSingle();

        if (rowErr) return res.status(500).json({ errorCode: "SERVER_ERROR" });

        if (!row) {
          const { error: insErr } = await supabase.from("cart_items").insert({
            cart_id: cartId,
            product_id,
            offer_id: offerId,
            selected_size: weight,
            quantity,
            unit_price: rupeesInt(baseRupee),
            discounted_unit_price: unitPrice,
            line_total: lineTotalRupees(unitPrice, quantity),
            meta: { discount_percent: discountPercent },
          });
          if (insErr) return res.status(500).json({ errorCode: "SERVER_ERROR" });
        }
      } else {
        const { data: row, error: rowErr } = await supabase
          .from("cart_items")
          .select("id, quantity")
          .eq("cart_id", cartId)
          .eq("product_id", product_id)
          .eq("selected_size", weight)
          .is("offer_id", null)
          .maybeSingle();

        if (rowErr) return res.status(500).json({ errorCode: "SERVER_ERROR" });

        if (row) {
          const newQty = Number(row.quantity ?? 0) + Number(quantity);
          const { error: updErr } = await supabase
            .from("cart_items")
            .update({
              quantity: newQty,
              discounted_unit_price: unitPrice,
              line_total: lineTotalRupees(unitPrice, newQty),
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);

          if (updErr) return res.status(500).json({ errorCode: "SERVER_ERROR" });
        } else {
          const { error: insErr } = await supabase.from("cart_items").insert({
            cart_id: cartId,
            product_id,
            offer_id: null,
            selected_size: weight,
            quantity,
            unit_price: rupeesInt(baseRupee),
            discounted_unit_price: unitPrice,
            line_total: lineTotalRupees(unitPrice, quantity),
          });
          if (insErr) return res.status(500).json({ errorCode: "SERVER_ERROR" });
        }
      }
    }

    const safeItems = Array.isArray(updatedCart.items) ? updatedCart.items : [];
    updatedCart.items = await enrichCartItems(safeItems);
    updatedCart.total_price = rupeesInt(updatedCart.total_price);

    return res.json({ errorCode: "NO_ERROR", cart: updatedCart });
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
    const { product_id, cartId, sessionId, weight, checkDelete, offerId } = req.body;

    if (!cartId && !sessionId) {
      return res.json({ errorCode: "NO_ERROR", cart: emptyCart(sessionId) });
    }

    let cartQuery = supabase.from("carts").select("*");
    cartId ? cartQuery.eq("id", cartId) : cartQuery.eq("session_id", sessionId);

    const { data: cart } = await cartQuery.maybeSingle();

    if (!cart) {
      return res.json({ errorCode: "NO_ERROR", cart: emptyCart(sessionId) });
    }

    let items: CartItem[] = Array.isArray(cart.items) ? cart.items : [];
    const hasOfferId = typeof offerId === "string" && offerId.trim() !== "";

    const index = items.findIndex((i: any) => {
      const sameProduct = i.product_id === product_id;
      const sameSize = i.size === weight;
      if (!sameProduct || !sameSize) return false;
      if (hasOfferId) return i.offer_id === offerId;
      return !i.offer_id;
    });

    if (index === -1) return res.json({ errorCode: "NO_ERROR", cart });

    if (checkDelete) {
      items.splice(index, 1);
    } else {
      if ((items[index] as any).quantity <= 1) items.splice(index, 1);
      else {
        (items[index] as any).quantity -= 1;
        (items[index] as any).total_price =
          (items[index] as any).quantity * (items[index] as any).price;
      }
    }

    if (!items.length) {
      await supabase.from("carts").delete().eq("id", cart.id);
      await supabase.from("cart_items").delete().eq("cart_id", cart.id);
      return res.json({ errorCode: "NO_ERROR", cart: emptyCart(sessionId) });
    }

    const normalized = normalizeCart(items);

    const { data: updatedCart, error: updErr } = await supabase
      .from("carts")
      .update({ ...normalized, updated_at: new Date().toISOString() })
      .eq("id", cart.id)
      .select("*")
      .single();

    if (updErr || !updatedCart) return res.status(500).json({ errorCode: "SERVER_ERROR" });

    updatedCart.items = await enrichCartItems(updatedCart.items);

    return res.json({ errorCode: "NO_ERROR", cart: updatedCart });
  } catch (e) {
    console.error("removeFromCart error:", e);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
}

/* =========================================================
   ✅ CREATE DB ORDER (public order_id = YYYYMMDDXXXXX)
   Returns:
   - id (uuid internal)
   - order_id (formatted public)
========================================================= */

type CreateOrderFromCartRequest = {
  userId?: string | null;
  sessionId?: string | null;
  cartId?: string | null;
  address_id?: string | null;
};

export async function createOrderFromCart(
  req: Request<{}, {}, CreateOrderFromCartRequest>,
  res: Response<any>
) {
  try {
    const { userId, sessionId, cartId, address_id } = req.body;

    if (!userId && !sessionId && !cartId) {
      return res.status(400).json({ errorCode: "CART_OWNER_REQUIRED" });
    }

    let q = supabase.from("carts").select("*");
    if (cartId) q = q.eq("id", cartId);
    else if (userId) q = q.eq("user_id", userId);
    else q = q.eq("session_id", sessionId);

    const { data: cart, error: cartErr } = await q.maybeSingle();
    if (cartErr) return res.status(500).json({ errorCode: "SERVER_ERROR" });

    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      return res.status(400).json({ errorCode: "CART_EMPTY" });
    }

    const cartItems = await enrichCartItems(cart.items);

    // ✅ public formatted order_id
    let orderId = await generateOrderId();

    // retry if conflict
    let orderRow: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: order, error: orderInsErr } = await supabase
        .from("orders")
        .insert({
          order_id: orderId, // ✅ YYYYMMDDXXXXX
          user_id: userId ?? cart.user_id ?? null,
          session_id: sessionId ?? cart.session_id ?? null,
          cart_id: cart.id,
          address_id: address_id ?? null,
          total_amount: rupeesInt(cart.total_price ?? 0),
          status: "created",
          created_at: new Date().toISOString(),
        })
        .select("*")
        .maybeSingle();

      if (!orderInsErr && order) {
        orderRow = order;
        break;
      }

      orderId = await generateOrderId();
    }

    if (!orderRow) return res.status(500).json({ errorCode: "ORDER_CREATE_FAILED" });

    const orderItemsPayload = cartItems.map((i: any) => ({
      order_id: orderRow.id, // FK -> orders.id (uuid)
      product_id: i.product_id,
      selected_size: i.size,
      quantity: Number(i.quantity ?? 0),
      unit_price: rupeesInt(i.price ?? 0),
      line_total: rupeesInt(i.total_price ?? 0),
      offer_id: i.offer_id ?? null,
      meta: {
        base_price: i.base_price ?? null,
        discount_percent: i.discount_percent ?? null,
        product_name: i.product_name ?? null,
      },
    }));

    const { error: itemsErr } = await supabase.from("order_items").insert(orderItemsPayload);

    if (itemsErr) {
      await supabase.from("orders").delete().eq("id", orderRow.id);
      return res.status(500).json({ errorCode: "ORDER_ITEMS_FAILED" });
    }

    // clear cart
    await supabase.from("carts").delete().eq("id", cart.id);
    await supabase.from("cart_items").delete().eq("cart_id", cart.id);

    // ✅ IMPORTANT: respond with formatted order_id, not uuid
    return res.json({
      errorCode: "NO_ERROR",
      data: {
        id: orderRow.id, // internal uuid
        order_id: orderRow.order_id, // ✅ formatted public id
        amount: orderRow.total_amount,
        currency: "INR",
      },
    });
  } catch (e) {
    console.error("createOrderFromCart error:", e);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
}

/* =========================================================
   ✅ CREATE RAZORPAY ORDER FOR A DB ORDER
   - Razorpay order_id will always look like: order_xxxxx
   - Your formatted order id goes in `receipt`
========================================================= */

type CreateRazorpayOrderRequest = {
  orderId: string; // formatted order_id (YYYYMMDDXXXXX)
};

export async function createRazorpayOrderForDbOrder(
  req: Request<{}, {}, CreateRazorpayOrderRequest>,
  res: Response<any>
) {
  try {
    const { orderId } = req.body;

    if (!orderId) return res.status(400).json({ errorCode: "ORDER_ID_REQUIRED" });

    // fetch by formatted order_id
    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (error) return res.status(500).json({ errorCode: "SERVER_ERROR" });
    if (!order) return res.status(404).json({ errorCode: "ORDER_NOT_FOUND" });

    // --- ⚠️ Your Razorpay creation code is in some other file.
    // The ONLY change you must do there is:
    //
    // const rpOrder = await razorpay.orders.create({
    //   amount: order.total_amount * 100,
    //   currency: "INR",
    //   receipt: order.order_id, // ✅ THIS makes your id visible in Razorpay dashboard & webhook payload
    //   notes: { order_id: order.order_id, db_id: order.id },
    // });
    //
    // Then store rpOrder.id into orders.razorpay_order_id.

    return res.json({
      errorCode: "NO_ERROR",
      message:
        "Implement Razorpay creation in your payments file using receipt: order.order_id (formatted).",
    });
  } catch (e) {
    console.error("createRazorpayOrderForDbOrder error:", e);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
}

/* =========================================================
   ✅ GET ORDERS + GET BY FORMATTED order_id
========================================================= */

type GetOrdersRequest = {
  userId?: string | null;
  sessionId?: string | null;
  orderId?: string | null; // formatted id
};

export async function getOrders(
  req: Request<{}, {}, any, GetOrdersRequest>,
  res: Response<any>
) {
  try {
    const { userId, sessionId, orderId } = req.query;

    if (!userId && !sessionId && !orderId) {
      return res.status(400).json({ errorCode: "OWNER_OR_ORDERID_REQUIRED" });
    }

    let q = supabase.from("orders").select("*, order_items(*)").order("created_at", {
      ascending: false,
    });

    if (orderId) q = q.eq("order_id", String(orderId));
    else if (userId) q = q.eq("user_id", String(userId));
    else if (sessionId) q = q.eq("session_id", String(sessionId));

    const { data, error } = await q;
    if (error) return res.status(500).json({ errorCode: "SERVER_ERROR" });

    return res.json({ errorCode: "NO_ERROR", orders: data ?? [] });
  } catch (e) {
    console.error("getOrders error:", e);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
}

type GetOrderByOrderIdParams = { orderId: string };

export async function getOrderByOrderId(
  req: Request<GetOrderByOrderIdParams>,
  res: Response<any>
) {
  try {
    const { orderId } = req.params;

    if (!orderId) return res.status(400).json({ errorCode: "ORDER_ID_REQUIRED" });

    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("order_id", orderId) // ✅ formatted order_id
      .maybeSingle();

    if (error) return res.status(500).json({ errorCode: "SERVER_ERROR" });
    if (!data) return res.status(404).json({ errorCode: "ORDER_NOT_FOUND" });

    return res.json({ errorCode: "NO_ERROR", order: data });
  } catch (e) {
    console.error("getOrderByOrderId error:", e);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
}

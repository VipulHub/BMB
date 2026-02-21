import type { Request, Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";

import supabase from "../../config/db.config.ts";
import { env } from "../../config/envConfig.ts";

import type {
  CreateOrderRequest,
  CreateOrderResponse,
  GetAllOrdersResponse,
  VerifyPaymentRequest,
} from "./types.ts";

import {
  createDelhiveryShipment,
  getDelhiveryShipmentStatus,
  type ShipmentData,
} from "../helper.ts";
import { sendShipmentCreatedEmailToUser } from "../../utils/email.ts";

/* =========================================================
   RAZORPAY INIT
========================================================= */

const razorpay = new Razorpay({
  key_id: env.SYSTEM === "LOCAL" ? env.RAZORPAY_LOCAL_KEY_ID : env.RAZORPAY_KEY_ID,
  key_secret:
    env.SYSTEM === "LOCAL"
      ? env.RAZORPAY_LOCAL_KEY_SECRET
      : env.RAZORPAY_KEY_SECRET,
});

/* =========================================================
   ORDER ID GENERATOR (YYYYMMDDXXXXX)
========================================================= */

function yyyyMMdd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function generateOrderId(): Promise<string> {
  const today = yyyyMMdd();

  const { data: rpcData, error: rpcErr } = await supabase.rpc("next_order_id", {
    date_text: today,
  });

  if (!rpcErr && rpcData && typeof rpcData === "string") return rpcData;

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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

/* =========================================================
   CART HELPERS
========================================================= */

async function getUserByJwtToken(jwtToken: string) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("jwt_token", jwtToken)
    .maybeSingle();
  if (error) throw error;
  return data as any | null;
}

async function getUserBySessionId(session_id: string) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("session_id", session_id)
    .maybeSingle();
  if (error) throw error;
  return data as any | null;
}

async function getCartRow(params: { user_id?: string | null; session_id?: string | null }) {
  const { user_id, session_id } = params;

  if (!user_id && !session_id) return null;

  if (user_id) {
    const { data, error } = await supabase
      .from("carts")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data as any;
  }

  if (session_id) {
    const { data, error } = await supabase
      .from("carts")
      .select("*")
      .eq("session_id", String(session_id))
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data as any;
  }

  return null;
}

async function getCartItems(cartId: string) {
  const { data, error } = await supabase
    .from("cart_items")
    .select("product_id, selected_size, quantity")
    .eq("cart_id", cartId);

  if (error) throw error;

  return (data ?? []).map((x: any) => ({
    product_id: String(x.product_id),
    selected_size: x.selected_size ?? null,
    quantity: Number(x.quantity ?? 1),
  })) as Array<{ product_id: string; selected_size: string | null; quantity: number }>;
}

/* =========================================================
   CART CLEAR
   ✅ clear cart ONLY after shipment (verify)
========================================================= */

async function clearCartForUserOrSession(params: {
  user_id?: string | null;
  session_id?: string | null;
}) {
  const { user_id, session_id } = params;

  if (!user_id && !session_id) return;

  const cartIds = new Set<string>();

  if (user_id) {
    const { data, error } = await supabase.from("carts").select("id").eq("user_id", user_id);
    if (error) throw error;
    (data ?? []).forEach((c: any) => c?.id && cartIds.add(c.id));
  }

  if (session_id) {
    const { data, error } = await supabase
      .from("carts")
      .select("id")
      .eq("session_id", String(session_id));
    if (error) throw error;
    (data ?? []).forEach((c: any) => c?.id && cartIds.add(c.id));
  }

  const ids = [...cartIds];
  if (ids.length === 0) return;

  const { error: delErr } = await supabase.from("cart_items").delete().in("cart_id", ids);
  if (delErr) throw delErr;

  const { error: updErr } = await supabase
    .from("carts")
    .update({
      items: [],
      product_count: 0,
      total_price: 0,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (updErr) throw updErr;
}

/* =========================================================
   SHIPMENT HELPERS
========================================================= */

function sanitizePhone(phone: string) {
  const digits = (phone || "").replace(/\D/g, "");
  const last10 = digits.slice(-10);
  return last10.length === 10 ? last10 : "9999999999";
}

function safePin(pin: any) {
  const num = Number(String(pin || "").replace(/\D/g, ""));
  return Number.isFinite(num) && num > 0 ? num : 122001;
}

function buildAddressLine(address: any) {
  const a1 = address?.address_line1 ?? "";
  const a2 = address?.address_line2 ?? "";
  return `${a1} ${a2}`.trim();
}

function buildProductsDescFromItems(items: any[], productsById: Record<string, { name: string }>) {
  const parts: string[] = [];
  for (const it of items) {
    const pid = String(it?.product_id ?? "");
    const p = productsById[pid];
    if (!p?.name) continue;

    const size = it?.size ? ` ${String(it.size)}` : "";
    const qty = Number(it?.quantity ?? 1) || 1;
    parts.push(`${p.name}${size} x${qty}`);
  }
  if (parts.length === 0) return "General Merchandise";
  return parts.slice(0, 10).join(", ");
}

/* =========================================================
   WEIGHT FROM carts.items (SOURCE OF TRUTH)
========================================================= */

function parseSizeToGrams(size: any): number | null {
  if (!size) return null;
  const s = String(size).trim().toLowerCase().replace(/\s+/g, "");

  const kgMatch = s.match(/^(\d+(\.\d+)?)kg$/);
  if (kgMatch?.[1]) {
    const kg = Number(kgMatch[1]);
    return Number.isFinite(kg) && kg > 0 ? Math.round(kg * 1000) : null;
  }

  const gMatch = s.match(/^(\d+(\.\d+)?)(g|gm)$/);
  if (gMatch?.[1]) {
    const g = Number(gMatch[1]);
    return Number.isFinite(g) && g > 0 ? Math.round(g) : null;
  }

  const n = Number(s.replace(/[^\d.]/g, ""));
  if (Number.isFinite(n) && n > 0) return Math.round(n);

  return null;
}

function calcWeightFromCartSnapshot(cartItemsJson: any): number {
  if (!Array.isArray(cartItemsJson) || cartItemsJson.length === 0) return 0;

  let grams = 0;

  for (const it of cartItemsJson) {
    const qty = Number(it?.quantity ?? 1) || 1;
    const sizeStr = it?.size ?? null;
    const perItemGrams = parseSizeToGrams(sizeStr);

    if (perItemGrams && perItemGrams > 0) grams += perItemGrams * qty;
    else grams += 500 * qty; // fallback per line item
  }

  return grams;
}

/* =========================================================
   BUILD DELHIVERY "ITEMS" ARRAY FROM carts.items
   ✅ NO products.sku usage (fixes your DB error)
========================================================= */

type ShipmentItem = {
  name: string;
  sku?: string;
  units: number;
  selling_price?: number;
  discount?: number;
  tax?: number;
  hsn?: string;
  category?: string;
  qty?: number;
  weight?: number;        // grams per unit (optional)
  total_weight?: number;  // total grams for this item line (weight * units)
};

function buildShipmentItemsFromCartSnapshot(params: {
  cartItemsJson: any[];
  productsById: Record<string, { name: string }>;
}): {
  items: ShipmentItem[];
  totalWeight: number; // ✅ grand total grams for all items
} {
  const { cartItemsJson, productsById } = params;

  if (!Array.isArray(cartItemsJson) || cartItemsJson.length === 0) {
    return { items: [], totalWeight: 0 };
  }

  const items: ShipmentItem[] = cartItemsJson
    .map((it: any) => {
      const pid = String(it?.product_id ?? "");
      const product = productsById[pid];

      const units = Number(it?.quantity ?? 1) || 1;
      const price = Number(it?.price ?? it?.selling_price ?? 0);
      const size = it?.size ?? null;

      let perUnitWeight = parseSizeToGrams(size);

      // ✅ ADD EXTRA PACKAGING WEIGHT LOGIC (after parsing grams)
      if (perUnitWeight === 227) {
        perUnitWeight = 227 + 53; // 280
      } else if (perUnitWeight === 410) {
        perUnitWeight = 410 + 80; // 490
      }

      const totalWeight =
        typeof perUnitWeight === "number" && Number.isFinite(perUnitWeight)
          ? perUnitWeight * units
          : 0;

      const itemNameBase = product?.name || "Item";
      const itemName = size ? `${itemNameBase} (${String(size)})` : itemNameBase;

      return {
        name: itemName,
        sku: pid,
        units,
        qty: units,
        selling_price: Number.isFinite(price) && price > 0 ? price : undefined,
        weight:
          typeof perUnitWeight === "number" && Number.isFinite(perUnitWeight)
            ? perUnitWeight
            : undefined,
        total_weight: totalWeight,
      } as ShipmentItem;
    })
    .filter((x) => x.units > 0 && x.name);

  // ✅ GRAND TOTAL (after additions)
  const totalShipmentWeight = items.reduce(
    (sum, item) => sum + (Number(item.total_weight) || 0),
    0
  );

  return {
    items,
    totalWeight: totalShipmentWeight,
  };
}


/* =========================================================
   CREATE ORDER
   ✅ DO NOT CLEAR CART HERE
========================================================= */

async function createOrder(
  req: Request<any, any, CreateOrderRequest>,
  res: Response<CreateOrderResponse>
) {
  try {
    const { customer, address, payment_method, cart, userId } = req.body;
    console.log(req.body);
    const bearerToken = getBearerToken(req);

    const user = await getUserByJwtToken(String(bearerToken || "")) || await getUserBySessionId(userId);
    if (!user) {
      return res.status(404).json({
        errorCode: "USER_NOT_FOUND",
        error: "User does not exist",
      });
    }
    console.log(user);

    const { error: updUserErr } = await supabase
      .from("users")
      .update({
        name: `${customer.first_name} ${customer.last_name}`,
        phone_number: customer.phone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updUserErr) {
      return res.status(500).json({ errorCode: "DB_ERROR", error: updUserErr.message });
    }

    const { data: existingAddress, error: addrFindErr } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .maybeSingle();

    if (addrFindErr) {
      return res.status(500).json({ errorCode: "DB_ERROR", error: addrFindErr.message });
    }

    if (existingAddress) {
      const { error: addrUpdErr } = await supabase
        .from("user_addresses")
        .update({
          full_name: `${customer.first_name} ${customer.last_name}`,
          address_line1: address.address_line,
          address_line2: address.locality ?? null,
          city: address.city,
          state: address.state,
          country: address.country,
          postal_code: address.pincode,
        })
        .eq("id", existingAddress.id);

      if (addrUpdErr) {
        return res.status(500).json({ errorCode: "DB_ERROR", error: addrUpdErr.message });
      }
    } else {
      const { error: addrInsErr } = await supabase.from("user_addresses").insert({
        user_id: user.id,
        full_name: `${customer.first_name} ${customer.last_name}`,
        address_line1: address.address_line,
        address_line2: address.locality ?? null,
        city: address.city,
        state: address.state,
        country: address.country,
        postal_code: address.pincode,
        is_active: true,
        is_default: true,
      });

      if (addrInsErr) {
        return res.status(500).json({ errorCode: "DB_ERROR", error: addrInsErr.message });
      }
    }

    const cartRow =
      (await getCartRow({ user_id: user.id })) ||
      (await getCartRow({ session_id: user.session_id ?? null })) ||
      (await getCartRow({ session_id: userId ?? null }));
    console.log(cartRow);

    if (!cartRow?.id) {
      return res.status(400).json({
        errorCode: "CART_EMPTY",
        error: "Cart is empty, cannot create order",
      } as any);
    }

    const snapshotItems: any[] = Array.isArray(cartRow.items) ? cartRow.items : [];
    if (snapshotItems.length === 0) {
      return res.status(400).json({
        errorCode: "CART_EMPTY",
        error: "Cart items missing in carts.items; cannot create order",
      } as any);
    }

    const total = Number(cartRow.total_price ?? cart?.total ?? 0);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({
        errorCode: "INVALID_TOTAL",
        error: "Invalid cart total",
      } as any);
    }

    const product_count = snapshotItems.reduce(
      (s: number, it: any) => s + (Number(it?.quantity ?? 1) || 1),
      0
    );

    const product_ids = Array.from(new Set(snapshotItems.map((it: any) => String(it.product_id))));

    const publicOrderId = await generateOrderId();

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(total * 100),
      currency: "INR",
      receipt: publicOrderId,
      payment_capture: true,
      notes: {
        order_id: publicOrderId,
        user_id: String(user.id),
      },
    });

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        order_id: publicOrderId,
        user_id: user.id,
        status: "pending",
        total_amount: total,
        razorpay_order_id: razorpayOrder.id,
        product_ids,
        product_count,
      })
      .select("*")
      .single();

    if (orderErr || !order) {
      return res.status(500).json({
        errorCode: "DB_ERROR",
        error: orderErr?.message ?? "Order insert failed",
      });
    }

    const { error: payHistErr } = await supabase.from("order_payment_history").insert({
      order_id: order.id,
      amount: total,
      method_used: payment_method,
      status: "initiated",
    });

    if (payHistErr) {
      return res.status(500).json({ errorCode: "DB_ERROR", error: payHistErr.message });
    }

    return res.status(200).json({
      errorCode: "NO_ERROR",
      data: {
        order_id: order.order_id,
        razorpay_order_id: razorpayOrder.id,
        amount: total,
        currency: "INR",
      },
    });
  } catch (e: any) {
    console.log(e);
    return res.status(500).json({
      errorCode: "SERVER_ERROR",
      error: e.message,
    });
  }
}

/* =========================================================
   VERIFY PAYMENT + CREATE SHIPMENT (FIXED + EMAIL)
   ✅ FIX: Delhivery "waybill missing"
      - Do NOT pass empty/invalid `waybill`
      - Use clean unique order ref (no ORD_ prefix)
      - Keep payment_mode internal (Prepaid/COD); createDelhiveryShipment normalizes
========================================================= */

async function verifyRazorpayPayment(
  req: Request<any, any, VerifyPaymentRequest>,
  res: Response
) {
  try {
    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!order_id) {
      return res.status(400).json({
        errorCode: "INVALID_REQUEST",
        error: "order_id is required",
      });
    }

    /* ===============================
       1) FETCH ORDER
    ================================ */
    let order: any = null;

    if (isUuid(String(order_id))) {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", order_id)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ errorCode: "DB_ERROR", error: error.message });
      }
      order = data;
    } else {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("order_id", order_id)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ errorCode: "DB_ERROR", error: error.message });
      }
      order = data;
    }

    if (!order) {
      return res.status(404).json({
        errorCode: "ORDER_NOT_FOUND",
        error: "Order not found",
      });
    }

    const orderUuid = order.id;

    /* ===============================
       2) FETCH PAYMENT HISTORY
    ================================ */
    const { data: payment, error: payErr } = await supabase
      .from("order_payment_history")
      .select("*")
      .eq("order_id", orderUuid)
      .maybeSingle();

    if (payErr) {
      return res.status(500).json({ errorCode: "DB_ERROR", error: payErr.message });
    }

    if (!payment) {
      return res.status(404).json({
        errorCode: "PAYMENT_NOT_FOUND",
        error: "Payment record missing",
      });
    }

    const methodUsed = payment.method_used as "ONLINE" | "COD";

    /* ===============================
       3) VERIFY / MARK PAYMENT
    ================================ */
    if (methodUsed === "ONLINE") {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({
          errorCode: "INVALID_REQUEST",
          error: "Razorpay payment fields missing",
        });
      }

      const body = `${razorpay_order_id}|${razorpay_payment_id}`;
      const secret =
        env.SYSTEM === "LOCAL"
          ? env.RAZORPAY_LOCAL_KEY_SECRET
          : env.RAZORPAY_KEY_SECRET;

      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        await supabase
          .from("order_payment_history")
          .update({ status: "failed" })
          .eq("order_id", orderUuid);

        return res.status(400).json({
          errorCode: "INVALID_SIGNATURE",
          error: "Payment verification failed",
        });
      }

      await supabase
        .from("orders")
        .update({ status: "paid", razorpay_payment_id })
        .eq("id", orderUuid);

      await supabase
        .from("order_payment_history")
        .update({ status: "success" })
        .eq("order_id", orderUuid);
    }

    if (methodUsed === "COD") {
      await supabase.from("orders").update({ status: "cod_confirmed" }).eq("id", orderUuid);

      await supabase
        .from("order_payment_history")
        .update({ status: "pending" })
        .eq("order_id", orderUuid);
    }

    /* ===============================
       4) IF SHIPMENT ALREADY EXISTS => RETURN
    ================================ */
    const { data: existingShipment, error: shipFindErr } = await supabase
      .from("shipping_details")
      .select("waybill, payment_mode, current_status, shipment_items")
      .eq("order_id", orderUuid)
      .maybeSingle();

    if (shipFindErr) {
      return res.status(500).json({ errorCode: "DB_ERROR", error: shipFindErr.message });
    }

    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("name, phone_number, email, session_id")
      .eq("id", order.user_id)
      .maybeSingle();

    if (userErr) {
      return res.status(500).json({ errorCode: "DB_ERROR", error: userErr.message });
    }

    if (existingShipment?.waybill) {
      await clearCartForUserOrSession({
        user_id: order.user_id,
        session_id: user?.session_id ?? null,
      });

      return res.status(200).json({
        errorCode: "NO_ERROR",
        data: {
          order_id: order.order_id,
          status: order.status,
          waybill: existingShipment.waybill,
        },
      });
    }

    /* ===============================
       5) FETCH DEFAULT ADDRESS
    ================================ */
    const { data: address, error: addrErr } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", order.user_id)
      .eq("is_default", true)
      .maybeSingle();

    if (addrErr) {
      return res.status(500).json({ errorCode: "DB_ERROR", error: addrErr.message });
    }

    if (!address) {
      return res.status(400).json({
        errorCode: "ADDRESS_MISSING",
        error: "Default address not found",
      });
    }

    /* ===============================
       6) FETCH CART SNAPSHOT (carts.items)
    ================================ */
    const cartRow =
      (await getCartRow({ user_id: order.user_id })) ||
      (await getCartRow({ session_id: user?.session_id ?? null }));

    if (!cartRow?.id) {
      return res.status(400).json({
        errorCode: "CART_EMPTY",
        error: "Cart not found while verifying shipment",
      } as any);
    }

    const snapshotItems: any[] = Array.isArray(cartRow.items) ? cartRow.items : [];
    if (snapshotItems.length === 0) {
      return res.status(400).json({
        errorCode: "CART_EMPTY",
        error: "Cart items missing in carts.items; cannot create shipment",
      } as any);
    }

    /* ===============================
       7) BUILD SHIPPING META (WEIGHT/QTY/DESC/ITEMS)
    ================================ */
    const weight = calcWeightFromCartSnapshot(snapshotItems);

    const quantity = snapshotItems.reduce(
      (sum: number, it: any) => sum + (Number(it?.quantity ?? 1) || 1),
      0
    );

    const productIdsToFetch = [
      ...new Set(snapshotItems.map((it: any) => String(it.product_id))),
    ];

    const productsById: Record<string, { name: string }> = {};
    if (productIdsToFetch.length > 0) {
      const { data: prodData, error: prodErr } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIdsToFetch);

      if (prodErr) {
        return res.status(500).json({ errorCode: "DB_ERROR", error: prodErr.message });
      }

      for (const p of prodData ?? []) productsById[p.id] = { name: p.name };
    }

    const payment_mode: "Prepaid" | "COD" =
      methodUsed === "ONLINE" ? "Prepaid" : "COD";

    const products_desc = buildProductsDescFromItems(snapshotItems, productsById);

    const shipment_items = buildShipmentItemsFromCartSnapshot({
      cartItemsJson: snapshotItems,
      productsById,
    });

    /* ===============================
       8) CREATE ONE DELHIVERY SHIPMENT ONLY
       ✅ FIX 1: order ref should be clean & unique (no "ORD_" prefix)
       ✅ FIX 2: remove `waybill:` (it was invalid and forces empty waybill)
    ================================ */
    const shipmentPayload: ShipmentData = {
      name: address.full_name || user?.name,
      phone: sanitizePhone(address.phone_number || user?.phone_number || ""),
      add: buildAddressLine(address),
      pin: safePin(address.postal_code),
      country: address.country || "India",

      order: String(order.order_id), // ✅ clean unique
      payment_mode,
      total_amount: Number(order.total_amount ?? 0),
      cod_amount: payment_mode === "COD" ? Number(order.total_amount ?? 0) : 0,

      products_desc,
      weight,
      quantity,

      state: address.state || "Haryana",
      city: address.city || "Gurugram",
      shipping_mode: "Surface",
      address_type: "home",
    };

    console.log("Shipment Payload (Delhivery):", shipmentPayload);
    console.log("Shipment Items (stored in DB):", shipment_items);

    const shipment = await createDelhiveryShipment(shipmentPayload, shipment_items.totalWeight);

    /* ===============================
       9) SAVE SHIPPING DETAILS + ITEMS IN DB
    ================================ */
    const { error: shipSaveErr } = await supabase.from("shipping_details").insert({
      order_id: orderUuid,
      waybill: shipment.waybill,
      delhivery_order_id: shipment.order_ref,

      consignee_name: shipmentPayload.name,
      phone: shipmentPayload.phone,
      address: shipmentPayload.add,
      pin: String(shipmentPayload.pin),
      country: shipmentPayload.country,

      payment_mode: shipmentPayload.payment_mode,
      total_amount: shipmentPayload.total_amount,
      cod_amount: shipmentPayload.payment_mode === "COD" ? shipmentPayload.total_amount : 0,

      shipping_mode: shipmentPayload.shipping_mode || "Surface",
      weight: shipmentPayload.weight ?? 0,
      quantity: shipmentPayload.quantity ?? 1,

      product_description: shipmentPayload.products_desc || "General Merchandise",

      shipment_items,

      current_status: shipment.status,
      current_location: shipment.sort_code ?? null,
      delhivery_status_code: shipment.status,
      delhivery_response: shipment.raw,

      updated_at: new Date().toISOString(),
    });

    if (shipSaveErr) {
      return res.status(500).json({ errorCode: "DB_ERROR", error: shipSaveErr.message });
    }

    /* ===============================
       9.5) SEND SHIPMENT EMAIL TO USER (BEST EFFORT)
    ================================ */
    if (user?.email) {
      try {
        await sendShipmentCreatedEmailToUser({
          to: user.email,
          customerName: shipmentPayload.name,
          orderId: String(order.order_id ?? orderUuid),
          waybill: shipment.waybill,
          paymentMode: shipmentPayload.payment_mode,
          totalAmount: Number(shipmentPayload.total_amount ?? 0),
          address: {
            full_name: address.full_name ?? null,
            phone_number: address.phone_number ?? null,
            address_line1: address.address_line1 ?? null,
            address_line2: address.address_line2 ?? null,
            city: address.city ?? null,
            state: address.state ?? null,
            country: address.country ?? null,
            postal_code: address.postal_code ?? null,
          },
          items: (shipment_items.items ?? []).map((it: any) => ({
            name: String(it?.name ?? "Item"),
            sku: it?.sku ?? null,
            units: Number(it?.units ?? it?.qty ?? 1) || 1,
            selling_price: Number.isFinite(Number(it?.selling_price))
              ? Number(it.selling_price)
              : null,
            weight: Number.isFinite(Number(it?.weight)) ? Number(it.weight) : null,
          })),
        });
        await sendShipmentCreatedEmailToUser({
          to: 'bmbstoreindia@gmail.com',
          customerName: shipmentPayload.name,
          orderId: String(order.order_id ?? orderUuid),
          waybill: shipment.waybill,
          paymentMode: shipmentPayload.payment_mode,
          totalAmount: Number(shipmentPayload.total_amount ?? 0),
          address: {
            full_name: address.full_name ?? null,
            phone_number: address.phone_number ?? null,
            address_line1: address.address_line1 ?? null,
            address_line2: address.address_line2 ?? null,
            city: address.city ?? null,
            state: address.state ?? null,
            country: address.country ?? null,
            postal_code: address.postal_code ?? null,
          },
          items: (shipment_items.items ?? []).map((it: any) => ({
            name: String(it?.name ?? "Item"),
            sku: it?.sku ?? null,
            units: Number(it?.units ?? it?.qty ?? 1) || 1,
            selling_price: Number.isFinite(Number(it?.selling_price))
              ? Number(it.selling_price)
              : null,
            weight: Number.isFinite(Number(it?.weight)) ? Number(it.weight) : null,
          })),
        });
      } catch (mailErr) {
        console.error("❌ Shipment email failed:", mailErr);
      }
    }

    /* ===============================
       10) CLEAR CART (AFTER SHIPMENT SAVED)
    ================================ */
    await clearCartForUserOrSession({
      user_id: order.user_id,
      session_id: user?.session_id ?? null,
    });

    return res.status(200).json({
      errorCode: "NO_ERROR",
      data: {
        order_id: order.order_id,
        status: order.status,
        waybill: shipment.waybill,
      },
    });
  } catch (e: any) {
    console.error("VERIFY PAYMENT ERROR:", e);

    const message = e?.message || "Server error";

    return res.status(500).json({
      errorCode: message.toLowerCase().includes("pickup")
        ? "DELHIVERY_PICKUP_CONFIG_ERROR"
        : "SERVER_ERROR",
      error: message,
    });
  }
}


function getBearerToken(req: Request) {
  const raw = String(req.headers.authorization || "").trim();
  if (!raw) return "";
  const [type, token] = raw.split(" ");
  if (type?.toLowerCase() !== "bearer") return "";
  return String(token || "").trim();
}

/* =========================================================
   GET ALL ORDERS (WITH LIVE TRACKING)
========================================================= */
async function getAllOrdersByUserId(req: Request, res: Response<GetAllOrdersResponse>) {
  try {
    const sessionId = getBearerToken(req);

    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("jwt_token", sessionId)
      .maybeSingle();

    if (userErr) throw userErr;

    if (!user) {
      return res.status(200).json({
        errorCode: "NO_ERROR",
        data: [],
      });
    }

    const { data: orders, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (orderErr) throw orderErr;

    if (!orders || orders.length === 0) {
      return res.status(200).json({
        errorCode: "NO_ERROR",
        data: [],
      });
    }

    const orderUuids = orders.map((o: any) => o.id);

    const [{ data: payments }, { data: shipments }] = await Promise.all([
      supabase.from("order_payment_history").select("*").in("order_id", orderUuids),
      supabase.from("shipping_details").select("*").in("order_id", orderUuids),
    ]);

    const trackingResults = await Promise.allSettled(
      (shipments ?? [])
        .filter((s: any) => s.waybill)
        .map(async (s: any) => ({
          order_id: s.order_id,
          tracking: await getDelhiveryShipmentStatus({ waybill: s.waybill }),
        }))
    );

    const trackingMap = new Map<string, any>();
    trackingResults.forEach((r) => {
      if (r.status === "fulfilled") trackingMap.set(r.value.order_id, r.value.tracking);
    });

    const response: GetAllOrdersResponse["data"] = orders.map((order: any) => {
      const payment = payments?.find((p: any) => p.order_id === order.id);
      const shipment = shipments?.find((s: any) => s.order_id === order.id);
      const tracking = trackingMap.get(order.id);

      const productIds = Array.isArray(order.product_ids) ? order.product_ids.map(String) : [];

      return {
        order_id: String(order.order_id ?? order.id),
        created_at: String(order.created_at),
        order_status: order.status,
        total_amount: Number(order.total_amount ?? 0),

        product_ids: productIds,
        product_count: Number(order.product_count ?? productIds.length),

        payment: {
          method: payment?.method_used ?? null,
          status: payment?.status ?? null,
          amount: payment?.amount ?? null,
          paid_at: payment?.updated_at ?? null,
          razorpay_payment_id: order.razorpay_payment_id ?? null,
        },

        shipping: {
          status: tracking?.Status?.Status ?? shipment?.current_status ?? null,
          tracking_number: shipment?.waybill ?? null,
          location: tracking?.Status?.Location ?? shipment?.current_location ?? null,
          expected_delivery: tracking?.ExpectedDeliveryDate ?? shipment?.expected_delivery ?? null,
        },
      };
    });

    return res.status(200).json({
      errorCode: "NO_ERROR",
      data: response,
    });
  } catch (e: any) {
    console.error("GET ORDERS ERROR:", e);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
      error: e.message,
    } as any);
  }
}

export { createOrder, verifyRazorpayPayment, getAllOrdersByUserId };

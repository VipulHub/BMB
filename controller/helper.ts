/* =========================================================
   delhivery.service.ts
========================================================= */

import axios from "axios";
import qs from "qs";
import { env } from "../config/envConfig.ts";
import supabase from "../config/db.config.ts";

/* ================= ENV ================= */

const {
  LOCAL_DELHIVERY_URL,
  PROD_DELHIVERY_URL,
  LOCAL_DELHIVERY_TRACK_URL,
  PROD_DELHIVERY_TRACK_URL,
  SYSTEM,
  DELHIVERY_API_KEY,
} = env;

/* ================= TYPES ================= */

export interface ShipmentData {
  // Consignee details
  name: string;                  // Name of the customer
  add: string;                   // Address line
  pin: number;                   // Pincode (number)
  phone: string;                 // Phone number (10 digits)
  country: string;               // Country

  // Order details
  order: string;                 // Unique order ID
  payment_mode: "Prepaid" | "COD";
  total_amount: number;          // Total order amount
  cod_amount?: number;           // Optional COD amount

  // Shipment details
  weight?: number;               // Weight in grams
  quantity?: number;             // Number of packages/items
  products_desc?: string;        // Product description
  state?: string;                // State of consignee
  city?: string;                 // City of consignee
  shipment_type?: string;        // "MPS" or leave undefined for single shipment
  master_id?: string;            // Master waybill ID for MPS shipments
  waybill?: string;              // Pre-assigned waybill, optional

  // Optional return details
  return_name?: string;
  return_address?: string;
  return_city?: string;
  return_phone?: string;
  return_state?: string;
  return_country?: string;

  // Optional seller/packaging details
  seller_name?: string;
  seller_add?: string;
  seller_inv?: string;
  hsn_code?: string;
  shipment_width?: number;       // cm
  shipment_height?: number;      // cm
  shipment_length?: number;      // cm
  address_type?: string;         // "home" | "office"
  shipping_mode?: string;        // "Surface" | "Express"
}

const packages = {
  p1: {
    weight: 85,
    width: 10.2,
    length: 17.8,
    height: 8.9
  },
  p2: {
    weight: 100,
    length: 17.8,
    width: 12.7,
    height: 11.4
  },
  p3: {
    weight: 100,
    length: 28,
    width: 15.3,
    height: 12.7
  },
}

export interface CreatedShipmentResult {
  waybill: string;
  order_ref: string;
  status: string;
  sort_code?: string;
  raw: any;
}

/* ================= HELPERS ================= */

const sanitize = (v: string) =>
  v.replace(/[&#%;\\]/g, "").trim();

/* ================= CREATE SHIPMENT (FIXED) ================= */
function pickPackage(totalWeightGrams: number) {
  if (totalWeightGrams <= 280) return packages.p1;
  if (totalWeightGrams <= 490) return packages.p2;
  return packages.p3;
}

export async function createDelhiveryShipment(
  shipment: ShipmentData,
  total_weight: number // items weight in grams
): Promise<CreatedShipmentResult> {

  const url = PROD_DELHIVERY_URL;

  const cleanPhone = String(shipment.phone ?? "")
    .replace(/\D/g, "")
    .slice(-10);

  const orderRef = sanitize(String(shipment.order ?? "ORDER_0001")).slice(0, 45);

  const normalizedPaymentMode =
    String(shipment.payment_mode ?? "").toUpperCase() === "COD"
      ? "COD"
      : "Pre-paid";

  /* ===============================
     STEP 1: Ensure items weight valid
  =============================== */

  const itemsWeightGrams =
    Number.isFinite(Number(total_weight)) && Number(total_weight) > 0
      ? Number(total_weight)
      : 0;

  /* ===============================
     STEP 2: Pick package based on items weight
  =============================== */

  const selectedPkg = pickPackage(itemsWeightGrams);

  /* ===============================
     STEP 3: ADD PACKAGE WEIGHT
  =============================== */

  const finalWeightGrams = itemsWeightGrams + Number(selectedPkg.weight);

  // Safety: minimum 100g
  const weightToSend = Math.max(100, Math.ceil(finalWeightGrams));

  /* ===============================
     Build Shipment Object
  =============================== */

  const shipmentObj = {
    name: sanitize(shipment.name) || "Customer Name",
    add: sanitize(shipment.add) || "Customer Address",
    pin: Number(shipment.pin) || 110001,
    phone: cleanPhone,
    country: shipment.country || "India",

    order: orderRef,
    payment_mode: normalizedPaymentMode,

    total_amount: Number(shipment.total_amount ?? 0),
    cod_amount:
      normalizedPaymentMode === "COD"
        ? Number(shipment.total_amount ?? 0)
        : 0,

    shipping_mode: shipment.shipping_mode || "Surface",

    // ✅ FINAL TOTAL WEIGHT (ITEMS + PACKAGE)
    weight: weightToSend, // grams (no conversion to KG)

    quantity: Number(shipment.quantity ?? 1) || 1,
    products_desc: shipment.products_desc || "General Merchandise",

    seller_name: shipment.seller_name || "Dasam Commerce Private Limited",
    seller_add: shipment.seller_add || "Warehouse Address",
    order_date: new Date().toISOString().split("T")[0],
    state: shipment.state || "Haryana",
    city: shipment.city || "Gurugram",

    return_name: shipment.return_name,
    return_address: shipment.return_address,
    return_city: shipment.return_city,
    return_phone: shipment.return_phone,
    return_state: shipment.return_state,
    return_country: shipment.return_country,
    hsn_code: shipment.hsn_code,
    seller_inv: shipment.seller_inv,

    ...(shipment.waybill && String(shipment.waybill).trim()
      ? { waybill: String(shipment.waybill).trim() }
      : {}),

    // ✅ FLOAT dimensions (no rounding)
    shipment_width: selectedPkg.width,
    shipment_height: selectedPkg.height,
    shipment_length: selectedPkg.length,

    address_type: shipment.address_type || "home",
  };

  const payload = {
    pickup_location: { name: "Dasam Commerce Private Limited" },
    shipments: [shipmentObj],
  };

  const body = qs.stringify({
    format: "json",
    data: JSON.stringify(payload),
  });

  /* ===============================
     API CALL
  =============================== */

  const res = await axios.post(url, body, {
    headers: {
      Authorization: `Token ${env.DELHIVERY_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const pkg = Array.isArray(res.data?.packages)
    ? res.data.packages[0]
    : null;

  if (!pkg?.waybill) {
    throw new Error("Delhivery shipment creation failed");
  }

  return {
    waybill: pkg.waybill,
    order_ref: pkg.order ?? pkg.refnum ?? orderRef,
    status: pkg.status ?? "created",
    sort_code: pkg.sort_code ?? null,
    raw: res.data,
  };
}



/* ===============================a
   SAVE FAILED JOB (UPSERT)
================================ */
async function saveFailedJob(args: {
  dedupeKey: string;
  jobType: string;
  functionName: string;
  payload: any;
  context?: any;
  errorMessage: string;
  errorStack?: string | null;
  statusCode?: number | null;
  response?: any;
}) {
  const {
    dedupeKey,
    jobType,
    functionName,
    payload,
    context,
    errorMessage,
    errorStack,
    statusCode,
    response,
  } = args;

  // ✅ upsert so same order doesn’t create multiple records
  const { error } = await supabase
    .from("failed_jobs")
    .upsert(
      {
        dedupe_key: dedupeKey,
        job_type: jobType,
        function_name: functionName,
        payload,
        context: context ?? {},
        status: "pending",
        last_error: errorMessage,
        last_error_stack: errorStack ?? null,
        last_status_code: statusCode ?? null,
        last_response: response ?? null,

        // reset retry controls when it fails again
        next_retry_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "dedupe_key" }
    );

  if (error) {
    console.error("❌ failed_jobs insert/upsert error:", error);
  }
}

/* ================= TRACK SHIPMENT ================= */

export async function getDelhiveryShipmentStatus({
  waybill,
  orderId,
}: {
  waybill?: string;
  orderId?: string;
}) {
  if (!waybill && !orderId) {
    throw new Error("waybill or orderId required");
  }

  const url =
    SYSTEM === "LOCAL"
      ? LOCAL_DELHIVERY_TRACK_URL
      : PROD_DELHIVERY_TRACK_URL;

  const res = await axios.get(url, {
    params: {
      waybill,
      ref_ids: orderId,
    },
    headers: {
      Authorization: `Token ${DELHIVERY_API_KEY}`,
    },
  });

  const shipment = res.data?.ShipmentData?.[0]?.Shipment;
  if (!shipment) throw new Error("No shipment data");

  return shipment;
}

export default {
  createDelhiveryShipment,
  getDelhiveryShipmentStatus,
};

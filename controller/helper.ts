/* =========================================================
   delhivery.service.ts
========================================================= */

import axios from "axios";
import qs from "qs";
import { env } from "../config/envConfig.ts";

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

/* ================= CREATE SHIPMENT ================= */
export async function createDelhiveryShipment(
  shipment: ShipmentData
): Promise<CreatedShipmentResult> {
  const url = env.SYSTEM === "LOCAL" ? env.LOCAL_DELHIVERY_URL : env.PROD_DELHIVERY_URL;
  console.log("Delhivery URL:", url);

  const cleanPhone = (shipment.phone).replace(/\D/g, "").slice(-10);

  // Build the payload dynamically using only required fields
  const payload = {
    pickup_location: { name: "Dasam Commerce Private Limited" },
    shipments: [
      {
        name: sanitize(shipment.name) || "Customer Name",
        add: sanitize(shipment.add) || "Customer Address",
        pin: Number(shipment.pin) || 110001,
        phone: cleanPhone,
        country: shipment.country || "India",
        order: sanitize(shipment.order).slice(0, 45) || "ORDER_0001",
        payment_mode: shipment.payment_mode || "Prepaid",
        total_amount: Number(shipment.total_amount) || 100,
        cod_amount: shipment.payment_mode === "COD" ? Number(shipment.total_amount) : 0,
        shipping_mode: "Surface",
        weight: Number(shipment.weight) || 500,
        quantity: Number(shipment.quantity) || 1,
        products_desc: shipment.products_desc || "General Merchandise",
        seller_name: shipment.seller_name || "Dasam Commerce Private Limited",
        seller_add: shipment.seller_add || "Warehouse Address",
        order_date: new Date().toISOString().split("T")[0],
        state: shipment.state || "Haryana",
        city: shipment.city || "Gurugram",

        // Optional fields: default to empty string to avoid Delhivery API errors
        return_name: shipment.return_name || "",
        return_address: shipment.return_address || "",
        return_city: shipment.return_city || "",
        return_phone: shipment.return_phone || "",
        return_state: shipment.return_state || "",
        return_country: shipment.return_country || "",
        hsn_code: shipment.hsn_code || "",
        seller_inv: shipment.seller_inv || "",
        waybill: shipment.waybill || "",
        shipment_width: Number(shipment.shipment_width) || 10,
        shipment_height: Number(shipment.shipment_height) || 10,
        shipment_length: Number(shipment.shipment_length) || 10,
        address_type: shipment.address_type || "home",
      },
    ],
  };

  const body = qs.stringify({
    format: "json",
    data: JSON.stringify(payload),
  });

  const res = await axios.post(url, body, {
    headers: {
      Authorization: `Token ${env.DELHIVERY_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const pkg = res.data?.packages?.[0];
  console.log("Delhivery Response:", res.data);

  if (!pkg?.waybill) {
    // Use rmk from API response if available
    throw new Error(pkg?.rmk || "Delhivery shipment creation failed");
  }

  return {
    waybill: pkg.waybill,
    order_ref: pkg.order,
    status: pkg.status ?? "created",
    sort_code: pkg.sort_code,
    raw: res.data,
  };
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

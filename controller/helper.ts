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
  name: string;
  add: string;
  pin: string;
  phone: string;
  order: string;
  payment_mode: "Prepaid" | "COD";
  country: string;
  total_amount: number;
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
  const url =
    SYSTEM === "LOCAL" ? LOCAL_DELHIVERY_URL : PROD_DELHIVERY_URL;

  const cleanPhone = shipment.phone.replace(/\D/g, "").slice(-10);

  const payload = {
    pickup_location: {
      name: "Dasam Commerce Private Limited",
    },
    shipments: [
      {
        name: sanitize(shipment.name),
        add: sanitize(shipment.add.replace(/[\/]/g, "")),
        pin: shipment.pin,
        phone: cleanPhone,
        country: shipment.country,
        order: sanitize(shipment.order).slice(0, 45),

        payment_mode: shipment.payment_mode,
        total_amount: shipment.total_amount,
        cod_amount:
          shipment.payment_mode === "COD"
            ? shipment.total_amount
            : 0,

        shipping_mode: "Surface",
        weight: "500",
        quantity: "1",
        products_desc: "General Merchandise",

        seller_name: "Dasam Commerce Private Limited",
        seller_add: "Warehouse Address",
        order_date: new Date().toISOString().split("T")[0],
      },
    ],
  };

  const body = qs.stringify({
    format: "json",
    data: JSON.stringify(payload),
  });

  const res = await axios.post(url, body, {
    headers: {
      Authorization: `Token ${DELHIVERY_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const pkg = res.data?.packages?.[0];
  if (!pkg?.waybill) {
    throw new Error(
      pkg?.remarks?.[0] || "Delhivery shipment creation failed"
    );
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

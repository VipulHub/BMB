// ================= DELHIVERY HELPER =================

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
  city?: string;
  state?: string;
}

export interface CreatedShipmentResult {
  waybill: string;
  order_ref: string;
  status: string;
  sort_code?: string;
  raw: any;
}

/* ================= HELPERS ================= */

const sanitize = (v: string) => v.replace(/[&#%;\\]/g, "").trim();

/* ================= CREATE SHIPMENT ================= */

export async function createDelhiveryShipment(
  shipment: ShipmentData
): Promise<CreatedShipmentResult> {
  try {
    if (!shipment.name || !shipment.add || !shipment.pin || !shipment.phone) {
      throw new Error("Missing mandatory shipment fields");
    }

    const url = SYSTEM === "LOCAL" ? LOCAL_DELHIVERY_URL : PROD_DELHIVERY_URL;

    const cleanPhone = shipment.phone.replace(/\D/g, "").slice(-10);
    if (cleanPhone.length !== 10) {
      throw new Error("Invalid phone number for Delhivery");
    }

    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD

    const payload = {
      pickup_location: {
        name: "Dasam Commerce Private Limited", // 🔥 Exact warehouse name from Delhivery dashboard
      },
      shipments: [
        {
          name: sanitize(shipment.name),
          add: sanitize(shipment.add),
          pin: String(shipment.pin),
          phone: cleanPhone,
          country: shipment.country || "India",
          order: sanitize(shipment.order),
          payment_mode: shipment.payment_mode === "COD" ? "COD" : "Prepaid",
          total_amount: String(shipment.total_amount),
          cod_amount: shipment.payment_mode === "COD" ? String(shipment.total_amount) : "0",
          shipping_mode: "Surface",
          weight: "0.5", // KG
          quantity: "1",
          products_desc: "General Merchandise",
        },
      ],
    };
    console.log(payload);
    
    const body = qs.stringify({
      format: "json",
      data: JSON.stringify(payload),
    });

    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Token ${DELHIVERY_API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 15000,
    });

    const pkg = res.data?.packages?.[0];

    if (!pkg?.waybill) {
      console.error("❌ DELHIVERY FAILURE:", {
        request: payload,
        response: res.data,
      });
      throw new Error(pkg?.remarks?.[0] || "Delhivery shipment creation failed");
    }

    return {
      waybill: pkg.waybill,
      order_ref: pkg.order,
      status: pkg.status ?? "created",
      sort_code: pkg.sort_code ?? null,
      raw: res.data,
    };
  } catch (err: any) {
    if (axios.isAxiosError(err)) {
      console.error("❌ DELHIVERY AXIOS ERROR:", {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
      });
      throw new Error(err.response?.data?.remarks?.[0] || "Delhivery API request failed");
    }

    console.error("❌ DELHIVERY ERROR:", err.message);
    throw new Error(err.message || "Unknown Delhivery error");
  }
}

/* ================= TRACK SHIPMENT ================= */

export async function getDelhiveryShipmentStatus({
  waybill,
}: {
  waybill: string;
}) {
  const url =
    SYSTEM === "LOCAL"
      ? LOCAL_DELHIVERY_TRACK_URL
      : PROD_DELHIVERY_TRACK_URL;

  const res = await axios.get(url, {
    params: { waybill },
    headers: {
      Authorization: `Token ${DELHIVERY_API_KEY}`,
    },
  });

  console.log("DELHIVERY TRACK RAW:", res.data);

  const shipment = res.data?.ShipmentData?.[0]?.Shipment;

  if (!shipment) {
    throw new Error("No shipment data from Delhivery");
  }

  return shipment;
}

export default {
  createDelhiveryShipment,
  getDelhiveryShipmentStatus,
};

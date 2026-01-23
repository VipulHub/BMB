import axios from "axios";
import qs from "qs";
import { env } from "../config/envConfig.ts";

const {
  LOCAL_DELHIVERY_URL,
  PROD_DELHIVERY_URL,
  SYSTEM,
  DELHIVERY_API_KEY,
} = env;

export interface ShipmentData {
  // Mandatory fields
  name: string;
  add: string;
  pin: string;
  phone: string;
  order: string;
  payment_mode: "Prepaid" | "COD";
  country: string;

  // Optional fields
  total_amount?: number;
  cod_amount?: number;
}

const sanitize = (value: string) =>
  value.replace(/[&#%;\\]/g, "").trim();

export async function createDelhiveryShipment(shipment: ShipmentData) {
  const url = SYSTEM === "LOCAL" ? LOCAL_DELHIVERY_URL : PROD_DELHIVERY_URL;

  // 1️⃣ VALIDATION OF MANDATORY FIELDS
  if (!shipment.name || !shipment.phone || !shipment.pin || !shipment.add || !shipment.order || !shipment.country) {
    throw new Error("Missing mandatory consignee fields");
  }

  if (shipment.payment_mode === "Prepaid" && (!shipment.total_amount || shipment.total_amount <= 0)) {
    throw new Error("Total amount must be greater than 0 for prepaid orders");
  }

  // 2️⃣ CLEAN / SANITIZE VALUES
  const cleanPhone = shipment.phone.replace(/\D/g, "").slice(-10);
  const cleanAddress = sanitize(shipment.add.replace(/[\/]/g, ""));
  const cleanOrder = sanitize(shipment.order);

  // 3️⃣ BUILD MINIMAL PAYLOAD
  const shipmentPayload: any ={
  "pickup_location": { "name": "Dasam Commerce Private Limited" },
  "shipments": [
    {
      "name": "Vipul Singh",
      "add": "Chandigarh sector 32c 200010 adsasdasdads",
      "pin": "160030",
      "phone": "8888888888",
      "order": "Order_53c4b229-1621-47ed-ad6f-8d3e95ed2388",
      "payment_mode": "COD",
      "country": "India",
      "cod_amount": 1124,
      "total_amount": 1124,
      "city": "Chandigarh",
      "state": "Punjab",
      "weight": "500",
      "shipping_mode": "Surface",
      "products_desc": "Order Items"
    }
  ]
}


  if (shipment.payment_mode === "Prepaid") {
    shipmentPayload.total_amount = shipment.total_amount;
  }

  if (shipment.payment_mode === "COD") {
    shipmentPayload.cod_amount = shipment.cod_amount ?? shipment.total_amount;
  }
  console.log("📦 Delhivery Payload:", JSON.stringify(shipmentPayload, null, 2));

  // 5️⃣ FORM-ENCODED REQUEST
  const body = qs.stringify({
    format: "json",
    data: JSON.stringify(shipmentPayload),
  });

  try {
    const response = await axios.post(url, body, {
      headers: {
        Authorization: `Token ${DELHIVERY_API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log("✅ Delhivery Response:", response.data);

    if (response.data?.error === true || response.data?.success === false) {
      throw new Error(
        response.data?.rmk ||
        response.data?.packages?.[0]?.remarks?.[0] ||
        "Delhivery shipment failed"
      );
    }

    return response.data;
  } catch (err: any) {
    console.error("❌ Delhivery shipment creation error:", err?.response?.data || err.message);
    throw err;
  }
}

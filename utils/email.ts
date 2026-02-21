// mailer.ts
import nodemailer from "nodemailer";
import type { Request, Response } from "express";

type MailAttachment = {
  filename: string;
  content?: any;
  path?: string;
  contentType?: string;
};

export type SendMailParams = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  fromName?: string;
  fromEmail?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: MailAttachment[];
};

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false") === "true";

// Prefer env creds; fallback to your current hardcoded values if env missing
const SMTP_USER = process.env.SMTP_USER || "vipulsignh.1@gmail.com";
const SMTP_PASS = process.env.SMTP_PASS || "nses ctiy nfst viro";

const DEFAULT_FROM_NAME = process.env.SMTP_FROM_NAME || "BMB Store System";
const DEFAULT_TO = process.env.ALERT_MAIL_TO || "bmbstoreindia@gmail.com";

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

/**
 * Optional: validate transporter config at startup
 */
async function verifyMailer() {
  try {
    await transporter.verify();
    console.log("✅ Nodemailer transporter verified");
  } catch (e) {
    console.error("❌ Nodemailer transporter verify failed:", e);
  }
}

/**
 * ✅ GENERIC MAIL SENDER
 */
async function sendMail(params: SendMailParams) {
  const {
    to,
    subject,
    text,
    html,
    fromName = DEFAULT_FROM_NAME,
    fromEmail = SMTP_USER,
    cc,
    bcc,
    replyTo,
    attachments,
  } = params;

  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new Error("sendMail: 'to' is required");
  }
  if (!subject) {
    throw new Error("sendMail: 'subject' is required");
  }
  if (!text && !html) {
    throw new Error("sendMail: either 'text' or 'html' is required");
  }

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html,
      cc,
      bcc,
      replyTo,
      attachments,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("📨 Mail sent:", info.messageId);
    }

    return info;
  } catch (e) {
    console.error("❌ sendMail failed:", e);
    throw e;
  }
}

/* =========================
   Helper: remove undefined keys
   (fix for exactOptionalPropertyTypes)
========================= */
function pickDefined<T extends Record<string, any>>(obj: T) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as {
    [K in keyof T as T[K] extends undefined ? never : K]: Exclude<T[K], undefined>;
  } & Partial<T>;
}

/* =========================
   Controller (API Route Handler)
   POST /user/sendEmail
   Body = SendMailParams
========================= */
async function sendEmailController(req: Request, res: Response) {
  try {
    const body = (req.body.reqbody || {}) as Partial<SendMailParams>;
    
    // ✅ required fields (with default fallback for "to")
    const to = body.to ?? DEFAULT_TO;
    const subject = body.subject;

    if (!subject) {
      return res.status(400).json({ success: false, message: "'subject' is required" });
    }
    if (!body.text && !body.html) {
      return res
        .status(400)
        .json({ success: false, message: "either 'text' or 'html' is required" });
    }

    // ✅ build params WITHOUT undefined keys
    const params = pickDefined({
      to,
      subject,
      text: body.text,
      html: body.html,
      fromName: body.fromName,
      fromEmail: body.fromEmail,
      cc: body.cc,
      bcc: body.bcc,
      replyTo: body.replyTo,
      attachments: body.attachments,
    });

    // ✅ Now TS is happy because undefined keys are removed
    const info = await sendMail(params as SendMailParams);

    return res.status(200).json({
      success: true,
      message: "Mail sent successfully",
      messageId: info.messageId,
    });
  } catch (e: any) {
    console.error("❌ sendEmailController error:", e);
    return res.status(400).json({
      success: false,
      message: e?.message || "Failed to send email",
    });
  }
}

/* =========================
   HTML helpers (reusable)
========================= */

function escapeHtml(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function baseTemplate(title: string, bodyHtml: string) {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5;">
    <h3 style="margin: 0 0 12px 0;">${escapeHtml(title)}</h3>
    ${bodyHtml}
    <hr style="margin: 16px 0; border: none; border-top: 1px solid #eee;" />
    <p style="color:#666; font-size: 12px; margin: 0;">
      Time: ${escapeHtml(new Date().toISOString())}
    </p>
  </div>
  `;
}

function buildEmailOtpMail(params: { otp: string; email: string }) {
  const { otp, email } = params;

  const subject = "Your OTP for BMB Login";

  const body = `
    <p>Hi,</p>
    <p>Your OTP for login is:</p>
    <p style="font-size:22px; font-weight:700; letter-spacing:4px; margin: 12px 0;">
      ${escapeHtml(otp)}
    </p>
    <p>This OTP is valid for <b>5 minutes</b>.</p>
    <p style="color:#666; font-size:12px;">Email: ${escapeHtml(email)}</p>
  `;

  return {
    subject,
    html: baseTemplate("BMB Login OTP", body),
  };
}


/* =========================
   Specific mail builders
========================= */

function buildDelhiveryFailureMail(params: {
  orderId?: string;
  attempt: number;
  maxAttempts: number;
  error: string;
  isFinal: boolean;
}) {
  const { orderId, attempt, maxAttempts, error, isFinal } = params;

  const subject = isFinal
    ? `❌ DELHIVERY FAILED PERMANENTLY | Order ${orderId ?? "N/A"}`
    : `⚠️ Delhivery Retry Failed | Order ${orderId ?? "N/A"} | Attempt ${attempt}`;

  const body = `
    <p><b>Order ID:</b> ${escapeHtml(orderId ?? "N/A")}</p>
    <p><b>Attempt:</b> ${attempt} / ${maxAttempts}</p>
    <p><b>Status:</b> ${escapeHtml(isFinal ? "REJECTED (DEAD)" : "WILL RETRY")}</p>
    <p><b>Error:</b></p>
    <pre style="background:#f6f6f6; padding:12px; border-radius:8px; white-space:pre-wrap;">${escapeHtml(
      error
    )}</pre>
  `;

  return {
    subject,
    html: baseTemplate("Delhivery Shipment Failure", body),
  };
}

function buildDelhiverySuccessMail(params: { orderId?: string; attemptsUsed: number }) {
  const { orderId, attemptsUsed } = params;

  const subject = `✅ Delhivery Shipment Created | Order ${orderId ?? "N/A"}`;

  const body = `
    <p><b>Order ID:</b> ${escapeHtml(orderId ?? "N/A")}</p>
    <p><b>Attempts Used:</b> ${attemptsUsed}</p>
    <p><b>Status:</b> SUCCESS</p>
  `;

  return {
    subject,
    html: baseTemplate("Delhivery Shipment Successful", body),
  };
}

/* =========================
   Convenience wrappers
========================= */

async function sendFailureEmail(params: {
  orderId?: string;
  attempt: number;
  maxAttempts: number;
  error: string;
  isFinal: boolean;
  to?: string | string[];
}) {
  const { to = DEFAULT_TO, ...rest } = params;
  const { subject, html } = buildDelhiveryFailureMail(rest);

  return sendMail({ to, subject, html });
}

async function sendSuccessEmail(params: {
  orderId?: string;
  attemptsUsed: number;
  to?: string | string[];
}) {
  const { to = DEFAULT_TO, ...rest } = params;
  const { subject, html } = buildDelhiverySuccessMail(rest);

  return sendMail({ to, subject, html });
}

/* =========================================================
   ✅ EMAIL TEMPLATE: Shipment Created (Customer)
   - Shows order id, waybill, payment, address, items list
   - Safe for exactOptionalPropertyTypes (no undefined keys)
========================================================= */

type ShipmentMailItem = {
  name: string;
  sku?: string | null;
  units: number;
  selling_price?: number | null;
  weight?: number | null; // grams per unit
};

function formatMoneyINR(n: any) {
  const num = Number(n ?? 0);
  if (!Number.isFinite(num)) return "₹0";
  return `₹${num.toFixed(2)}`;
}

function formatDateIST(d = new Date()) {
  // simple display; if you want exact IST formatting use Intl.DateTimeFormat
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function buildShipmentCreatedCustomerMail(params: {
  customerName: string;
  customerEmail: string;

  orderId: string; // public order_id (YYYYMMDDxxxxx)
  waybill: string;

  paymentMode: "Prepaid" | "COD";
  totalAmount: number;

  address: {
    full_name?: string | null;
    phone_number?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    postal_code?: string | null;
  };

  items: ShipmentMailItem[];
}) {
  const {
    customerName,
    customerEmail,
    orderId,
    waybill,
    paymentMode,
    totalAmount,
    address,
    items,
  } = params;

  const addrLines = [
    address.address_line1,
    address.address_line2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ]
    .filter(Boolean)
    .map((x) => escapeHtml(String(x)))
    .join(", ");

  const itemsRows =
    Array.isArray(items) && items.length > 0
      ? items
          .map((it) => {
            const units = Number(it.units ?? 1) || 1;
            const price = Number(it.selling_price ?? 0);
            const lineTotal =
              Number.isFinite(price) && price > 0 ? price * units : null;

            return `
              <tr>
                <td style="padding:10px; border-top:1px solid #eee;">
                  <div style="font-weight:600;">${escapeHtml(it.name)}</div>
                  ${
                    it.sku
                      ? `<div style="color:#777; font-size:12px;">SKU: ${escapeHtml(
                          String(it.sku)
                        )}</div>`
                      : ""
                  }
                  ${
                    it.weight
                      ? `<div style="color:#777; font-size:12px;">Weight: ${escapeHtml(
                          String(it.weight)
                        )}g</div>`
                      : ""
                  }
                </td>
                <td style="padding:10px; border-top:1px solid #eee; text-align:center;">
                  ${units}
                </td>
                <td style="padding:10px; border-top:1px solid #eee; text-align:right;">
                  ${Number.isFinite(price) && price > 0 ? formatMoneyINR(price) : "-"}
                </td>
                <td style="padding:10px; border-top:1px solid #eee; text-align:right;">
                  ${lineTotal !== null ? formatMoneyINR(lineTotal) : "-"}
                </td>
              </tr>
            `;
          })
          .join("")
      : `
        <tr>
          <td colspan="4" style="padding:10px; border-top:1px solid #eee; color:#777;">
            Items will be visible once packed.
          </td>
        </tr>
      `;

  const subject = `✅ Shipment Created | Order ${orderId}`;

  const body = `
    <p>Hi <b>${escapeHtml(customerName || "Customer")}</b>,</p>
    <p>Your order has been confirmed and your shipment has been created.</p>

    <div style="background:#f7f7f7; padding:12px; border-radius:10px; margin:14px 0;">
      <div><b>Order ID:</b> ${escapeHtml(orderId)}</div>
      <div><b>Tracking (Waybill):</b> ${escapeHtml(waybill)}</div>
      <div><b>Payment:</b> ${escapeHtml(paymentMode)} • <b>Total:</b> ${formatMoneyINR(totalAmount)}</div>
      <div style="color:#666; font-size:12px; margin-top:6px;">
        Created: ${escapeHtml(formatDateIST(new Date()))}
      </div>
    </div>

    <h4 style="margin: 18px 0 10px 0;">Delivery Address</h4>
    <div style="background:#fff; border:1px solid #eee; padding:12px; border-radius:10px;">
      <div style="font-weight:600;">${escapeHtml(address.full_name || customerName || "Customer")}</div>
      <div style="color:#333; margin-top:6px;">${addrLines || "-"}</div>
      <div style="color:#333; margin-top:6px;">
        Phone: ${escapeHtml(String(address.phone_number || ""))}
      </div>
      <div style="color:#777; font-size:12px; margin-top:6px;">
        Email: ${escapeHtml(customerEmail)}
      </div>
    </div>

    <h4 style="margin: 18px 0 10px 0;">Items</h4>
    <table style="width:100%; border-collapse:collapse; border:1px solid #eee; border-radius:10px; overflow:hidden;">
      <thead>
        <tr style="background:#fafafa;">
          <th style="text-align:left; padding:10px;">Product</th>
          <th style="text-align:center; padding:10px;">Qty</th>
          <th style="text-align:right; padding:10px;">Price</th>
          <th style="text-align:right; padding:10px;">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div style="text-align:right; margin-top:12px;">
      <div style="font-size:14px; color:#666;">Grand Total</div>
      <div style="font-size:18px; font-weight:800;">${formatMoneyINR(totalAmount)}</div>
    </div>

    <p style="margin-top:18px;">
      You can track your shipment using the waybill number:
      <b>${escapeHtml(waybill)}</b>
    </p>

    <p style="color:#666; font-size:12px;">
      Note: Delhivery portal may show a single package entry even if multiple items exist.
      Your complete item list is recorded in our system and shown above.
    </p>
  `;

  return {
    subject,
    html: baseTemplate("Shipment Created", body),
  };
}

/* =========================================================
   ✅ SEND SHIPMENT MAIL TO USER
========================================================= */
async function sendShipmentCreatedEmailToUser(params: {
  to: string;
  customerName: string;
  orderId: string;
  waybill: string;
  paymentMode: "Prepaid" | "COD";
  totalAmount: number;
  address: any;
  items: ShipmentMailItem[];
}) {
  const { subject, html } = buildShipmentCreatedCustomerMail({
    customerName: params.customerName,
    customerEmail: params.to,
    orderId: params.orderId,
    waybill: params.waybill,
    paymentMode: params.paymentMode,
    totalAmount: params.totalAmount,
    address: params.address,
    items: params.items,
  });

  // ✅ using your generic sender
  return sendMail({
    to: params.to,
    subject,
    html,
  });
}

export {
  transporter,
  verifyMailer,
  sendMail,
  sendEmailController, // ✅ use this in your route
  escapeHtml,
  baseTemplate,
  buildDelhiveryFailureMail,
  buildDelhiverySuccessMail,
  sendFailureEmail,
  sendSuccessEmail,
  buildEmailOtpMail,
  sendShipmentCreatedEmailToUser
};

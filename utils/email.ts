// mailer.ts
import nodemailer from "nodemailer";

type MailAttachment = {
  filename: string;
  content?: any;
  path?: string;
  contentType?: string;
};

type SendMailParams = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  fromName?: string; // optional override
  fromEmail?: string; // optional override
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
  secure: SMTP_SECURE, // true for 465, false for 587
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
 * ✅ GENERIC MAIL SENDER (use this everywhere)
 * You pass subject + html/text + recipients, that's it.
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

    // Helpful in dev
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
   HTML helpers (reusable)
========================= */

// basic HTML escaping for email safety
function escapeHtml(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Simple wrapper template so all mails look consistent
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

/* =========================
   Specific mail builders
   (only create HTML + subject)
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

function buildDelhiverySuccessMail(params: {
  orderId?: string;
  attemptsUsed: number;
}) {
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
   (call generic sendMail)
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

  return sendMail({
    to,
    subject,
    html,
  });
}

async function sendSuccessEmail(params: {
  orderId?: string;
  attemptsUsed: number;
  to?: string | string[];
}) {
  const { to = DEFAULT_TO, ...rest } = params;
  const { subject, html } = buildDelhiverySuccessMail(rest);

  return sendMail({
    to,
    subject,
    html,
  });
}

export {
  transporter,
  verifyMailer,
  sendMail, // ✅ generic mail sender
  // helpers
  escapeHtml,
  baseTemplate,
  // html builders (optional exports)
  buildDelhiveryFailureMail,
  buildDelhiverySuccessMail,
  // convenience functions (your current use-cases)
  sendFailureEmail,
  sendSuccessEmail,
};

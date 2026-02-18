import type { Request, Response } from "express";
import supabase from "../../config/db.config.ts";
import { emitter } from "../../utils/emiter.ts";
import { createToken, generateOTP } from "../../utils/utils.ts";
import { client } from "../../config/twerlio.ts";
import type {
  CreateLeadRequestBody,
  CreateLeadResponse,
  getAllUserData,
  OtpAuthRequest,
  OtpAuthResponse,
  SignLoginResponse,
  SignOutResponse,
  UpdateAccountRequest,
  UpdateAccountResponse,
} from "./types.ts";
import { buildEmailOtpMail, sendMail } from "../../utils/email.ts";

/* ===============================
   GET ALL USERS
================================ */
async function getAllUsers(
  _req: Request,
  res: Response
): Promise<Response<getAllUserData>> {
  try {
    const { data, error } = await supabase.from("users").select("*");
    if (error) throw error;

    return res.json({
      errorCode: "NO_ERROR",
      data,
    });
  } catch (e: any) {
    return res.status(500).json({
      errorCode: "Server_Error",
      error: e.message,
    });
  }
}

async function fetchAddress(userId: string) {
  const { data: address } = await supabase
    .from("user_addresses")
    .select(
      `
      full_name,
      address_line1,
      address_line2,
      postal_code,
      city,
      state,
      country
    `
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("is_default", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return address;
}



/* ===============================
   LOGIN → SEND OTP (EMAIL)
   - sessionId is the identifier coming from client
   - If email already exists in DB: DO NOT create/overwrite another user
     -> use the existing email user and attach this sessionId to it
   - Else: update the session user’s email
================================ */
async function loginWithSessionId(
  req: Request<{}, {}, { sessionId?: string; email?: string }>,
  res: Response<any>
): Promise<Response<any>> {
  try {
    const getBearerToken = () => {
      const raw = String(req.headers.authorization || "").trim();
      if (!raw) return "";
      const [type, token] = raw.split(" ");
      if (type?.toLowerCase() !== "bearer") return "";
      return String(token || "").trim();
    };

    const normalizeEmail = (v: string) => String(v || "").trim().toLowerCase();
    const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

    const normalizeSessionId = (v: string) => {
      let s = String(v || "").trim();
      if (!s) return "";
      if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))
      ) {
        s = s.slice(1, -1).trim();
      }
      try {
        s = decodeURIComponent(s);
      } catch {}
      return s.trim();
    };

    // ✅ sessionId ONLY
    const sessionId =
      normalizeSessionId(req.body.sessionId!) ||
      normalizeSessionId(req.cookies?.SESSION_ID);

    if (!sessionId) {
      return res.status(400).json({
        errorCode: "INVALID_REQUEST",
        message: "sessionId is required",
      });
    }

    const bearerToken = getBearerToken();
    const emailFromBody = normalizeEmail(req.body.email || "");

    if (!emailFromBody) {
      return res.status(400).json({
        errorCode: "INVALID_REQUEST",
        message: "email is required",
      });
    }

    if (!isValidEmail(emailFromBody)) {
      return res.status(400).json({
        errorCode: "INVALID_REQUEST",
        message: "Invalid email address",
      });
    }

    const makeJwtAndSave = async (userId: string, email: string) => {
      const token = await createToken({ userId, email });
      const jwtExpiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const { error } = await supabase
        .from("users")
        .update({
          jwt_token: token,
          jwt_expires_at: jwtExpiresAt,
          email, // ✅ ensure email stored
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;
      return { token, jwtExpiresAt };
    };

    const saveAndSendOtp = async (userId: string, email: string) => {
      const otp = String(generateOTP());
      const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      await supabase.from("user_otps").delete().eq("user_id", userId);

      const { error } = await supabase.from("user_otps").insert({
        user_id: userId,
        otp,
        expires_at: otpExpiresAt,
      });

      if (error) throw error;

      const { subject, html } = buildEmailOtpMail({ otp, email });
      await sendMail({ to: email, subject, html });
    };

    const buildUserResponse = async (userRow: any, token: string, message: string) => {
      const address = await fetchAddress(userRow.id);

      let fullName =
        (userRow.name && String(userRow.name).trim()) ||
        (address?.full_name && String(address.full_name).trim()) ||
        "";

      if (!userRow.name && address?.full_name) {
        await supabase.from("users").update({ name: address.full_name }).eq("id", userRow.id);
        userRow.name = address.full_name;
      }

      const [firstName, ...lastNameParts] = fullName.split(" ");

      const userAddress = {
        address: address?.address_line1 || "",
        locality: address?.address_line2 || "",
        pincode: address?.postal_code || "",
        city: address?.city || "",
        state: address?.state || "",
        country: address?.country || "",
      };

      return res.json({
        errorCode: "NO_ERROR",
        message,
        token: token || "",
        userId: userRow.id,
        user: {
          firstName: firstName || "",
          lastName: lastNameParts.join(" ") || "",
          email: userRow.email || "",
          phone: userRow.phone_number,
        },
        address: userAddress,
      });
    };

    // -----------------------------------------------------
    // ✅ A) Find user by session_id (existing session user)
    // -----------------------------------------------------
    const { data: userBySession, error: findSessionErr } = await supabase
      .from("users")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (findSessionErr) throw findSessionErr;

    // -----------------------------------------------------
    // ✅ B) Find user by email (existing email user)
    // -----------------------------------------------------
    const { data: userByEmail, error: findEmailErr } = await supabase
      .from("users")
      .select("*")
      .eq("email", emailFromBody)
      .maybeSingle();

    if (findEmailErr) throw findEmailErr;

    // -----------------------------------------------------
    // ✅ C) Decide target user
    //    - If email exists: use that user and attach sessionId
    //    - Else: use session user and update email
    // -----------------------------------------------------
    let user: any = null;

    if (userByEmail) {
      // ✅ Email already exists -> use existing email user
      user = userByEmail;

      // Attach sessionId to this email user if needed
      if (String(user.session_id || "").trim() !== sessionId) {
        const { error: attachSessionErr } = await supabase
          .from("users")
          .update({
            session_id: sessionId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (attachSessionErr) throw attachSessionErr;
        user.session_id = sessionId;
      }

      // Detach sessionId from old session user (avoid 1 session -> 2 users)
      if (userBySession && userBySession.id !== userByEmail.id) {
        const { error: detachErr } = await supabase
          .from("users")
          .update({
            session_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userBySession.id);

        if (detachErr) throw detachErr;
      }
    } else {
      // ✅ Email not found -> must have session user to update
      if (!userBySession) {
        return res.status(404).json({
          errorCode: "USER_NOT_FOUND",
          message: "No user found for this sessionId (and email does not exist)",
        });
      }

      user = userBySession;

      // Update email if changed
      const emailChanged = normalizeEmail(user.email || "") !== emailFromBody;
      if (emailChanged) {
        const { error: updEmailErr } = await supabase
          .from("users")
          .update({
            email: emailFromBody,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (updEmailErr) throw updEmailErr;
        user.email = emailFromBody;
      }
    }

    // -----------------------------------------------------
    // ✅ D) Token priority: Bearer > DB (if not expired) > create
    // -----------------------------------------------------
    const dbToken = String(user.jwt_token || "").trim();
    const isExpired = user.jwt_expires_at
      ? new Date(user.jwt_expires_at).getTime() <= Date.now()
      : true;

    let finalToken = "";

    if (bearerToken) {
      finalToken = bearerToken;

      // keep DB synced with bearer token
      if (!dbToken || isExpired || dbToken !== bearerToken) {
        const jwtExpiresAt = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString();

        const { error: updErr } = await supabase
          .from("users")
          .update({
            jwt_token: bearerToken,
            jwt_expires_at: jwtExpiresAt,
            email: emailFromBody, // ✅ ensure email correct
            session_id: sessionId, // ✅ ensure session correct
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        if (updErr) throw updErr;

        user.jwt_token = bearerToken;
        user.jwt_expires_at = jwtExpiresAt;
        user.email = emailFromBody;
        user.session_id = sessionId;
      }
    } else if (dbToken && !isExpired) {
      finalToken = dbToken;
    } else {
      const { token, jwtExpiresAt } = await makeJwtAndSave(user.id, emailFromBody);
      finalToken = token;

      user.jwt_token = token;
      user.jwt_expires_at = jwtExpiresAt;
      user.email = emailFromBody;
    }

    // -----------------------------------------------------
    // ✅ E) Always send OTP to latest email
    // -----------------------------------------------------
    await saveAndSendOtp(user.id, emailFromBody);

    return buildUserResponse(user, finalToken, "OTP sent successfully");
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({
      errorCode: "SERVER_ERROR",
      message: e.message || "Something went wrong",
    });
  }
}





/* ===============================
   OTP AUTH / VERIFY OTP
   - Verify OTP
   - Rotate JWT (create new, update DB)
   - Token comes from Bearer header (optional; used only to identify user if you want)
================================ */
async function otpAuth(
  req: Request<{}, {}, OtpAuthRequest>,
  res: Response<OtpAuthResponse>
): Promise<Response<OtpAuthResponse>> {
  try {
    emitter.emit("log", { msg: `Controller Initialize for ${otpAuth.name}`, level: "info" });

    const { otp } = req.body;

    const normalizeSessionId = (v: string) => {
      let s = String(v || "").trim();
      if (!s) return "";
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
      }
      try {
        s = decodeURIComponent(s);
      } catch { }
      return s.trim();
    };

    const sessionId = normalizeSessionId(req.cookies?.SESSION_ID);

    if (!sessionId) {
      return res.status(400).json({
        errorCode: "INVALID_REQUEST",
        error: "SESSION_ID cookie is missing",
      });
    }

    if (!otp) {
      return res.status(400).json({
        errorCode: "INVALID_REQUEST",
        error: "OTP is required",
      });
    }

    /* ---------- FETCH OTP (latest) ---------- */
    const { data: otpRecord, error: otpErr } = await supabase
      .from("user_otps")
      .select("*")
      .eq("otp", otp)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpErr || !otpRecord) {
      return res.status(401).json({
        errorCode: "INVALID_OTP",
        error: "OTP is invalid",
      });
    }

    /* ---------- CHECK EXPIRY ---------- */
    const now = Date.now();
    const expiresAt = new Date(otpRecord.expires_at).getTime();
    if (expiresAt <= now) {
      return res.status(401).json({
        errorCode: "OTP_EXPIRED",
        error: "OTP has expired",
      });
    }

    // ✅ Find session user first
    const { data: sessionUser, error: sessionUserErr } = await supabase
      .from("users")
      .select("id, name, email, phone_number, session_id")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (sessionUserErr) throw sessionUserErr;

    if (!sessionUser) {
      return res.status(404).json({
        errorCode: "USER_NOT_FOUND",
        error: "No user found for this session. Please login again.",
      });
    }

    // ✅ OTP must belong to THIS session user
    if (String(sessionUser.id) !== String(otpRecord.user_id)) {
      return res.status(401).json({
        errorCode: "UNAUTHORIZED",
        error: "OTP does not belong to this session",
      });
    }

    const email = String(sessionUser.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        errorCode: "INVALID_REQUEST",
        error: "User email is missing. Please login again with email.",
      });
    }

    /* ---------- ROTATE TOKEN (ALWAYS create NEW & update DB) ---------- */
    const newToken = await createToken({ userId: sessionUser.id, email });
    const jwtExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: tokenUpdErr } = await supabase
      .from("users")
      .update({
        jwt_token: newToken,
        jwt_expires_at: jwtExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionUser.id);

    if (tokenUpdErr) throw tokenUpdErr;

    /* ---------- FETCH DEFAULT ADDRESS ---------- */
    const { data: address } = await supabase
      .from("user_addresses")
      .select(`address_line1, address_line2, postal_code, city, state, country`)
      .eq("user_id", sessionUser.id)
      .eq("is_active", true)
      .eq("is_default", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    /* ---------- DELETE OTP (one-time use) ---------- */
    await supabase.from("user_otps").delete().eq("id", otpRecord.id);

    const fullName = String(sessionUser.name || "").trim();
    const [firstName, ...lastNameParts] = fullName.split(" ").filter(Boolean);

    return res.json({
      errorCode: "NO_ERROR",
      message: "OTP verified successfully",
      token: newToken,
      userId: sessionUser.id,
      user: {
        firstName: firstName || "",
        lastName: lastNameParts.join(" ") || "",
        email: sessionUser.email || "",
        phone: sessionUser.phone_number,
      },
      address: address
        ? {
          address: address.address_line1 || "",
          locality: address.address_line2 || "",
          pincode: address.postal_code || "",
          city: address.city || "",
          state: address.state || "",
          country: address.country || "",
        }
        : {},
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({
      errorCode: "Server_Error",
      error: e.message,
    });
  }
}



/* ===============================
   SIGN OUT
================================ */
async function signout(
  req: Request,
  res: Response
): Promise<Response<SignOutResponse>> {
  try {
    const token = req.headers["token"] as string;
    if (!token) {
      return res.status(401).json({ errorCode: "Invalid_Token" });
    }

    const { error } = await supabase.auth.admin.signOut(token);
    if (error) throw error;

    return res.json({ errorCode: "NO_ERROR" });
  } catch (e: any) {
    return res.status(500).json({
      errorCode: "Server_Error",
      error: e.message,
    });
  }
}

/* ===============================
   CREATE LEAD
================================ */
/* ===============================
   CREATE / UPDATE LEAD
   - If lead for sessionId exists: update only provided fields (email / phone)
   - If not exists: insert (with whichever field is provided)
================================ */
async function createLead(
  req: Request,
  res: Response
): Promise<Response<CreateLeadResponse>> {
  try {
    const { phoneNumber, email, sessionId } =
      req.body as CreateLeadRequestBody;

    // ✅ Build update payload with only provided fields
    const payload: Record<string, any> = {};
    if (email && String(email).trim()) payload.email = String(email).trim();
    if (phoneNumber && String(phoneNumber).trim())
      payload.phone_number = String(phoneNumber).trim();

    // ✅ Must have at least one field to update
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        error: "Either email or phoneNumber is required",
      });
    }

    // 1) Check if a lead already exists for this session
    const { data: existingLead, error: findErr } = await supabase
      .from("leads")
      .select("id")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (findErr) throw findErr;

    // 2) Update if exists, else insert
    if (existingLead?.id) {
      const { data: updated, error: updErr } = await supabase
        .from("leads")
        .update(payload)
        .eq("id", existingLead.id)
        .select("id")
        .single();

      if (updErr) throw updErr;

      return res.status(200).json({
        errorCode: "NO_ERROR",
        message: "Lead updated successfully",
        leadId: updated.id,
      });
    }

    const { data: created, error: insErr } = await supabase
      .from("leads")
      .insert([
        {
          session_id: sessionId,
          ...payload, // ✅ only provided fields
        },
      ])
      .select("id")
      .single();

    if (insErr) throw insErr;

    return res.status(201).json({
      errorCode: "NO_ERROR",
      message: "Lead created successfully",
      leadId: created.id,
    });
  } catch (e: any) {
    return res.status(500).json({
      errorCode: "Server_Error",
      error: e.message,
    });
  }
}

function clean(v: any) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

function splitName(full: string) {
  const x = clean(full);
  if (!x) return { firstName: "", lastName: "" };
  const [firstName, ...rest] = x.split(/\s+/);
  return { firstName: firstName || "", lastName: rest.join(" ") || "" };
}
function getBearerToken(req: Request) {
  const raw = String(req.headers.authorization || "").trim();
  if (!raw) return "";
  const [type, token] = raw.split(" ");
  if (type?.toLowerCase() !== "bearer") return "";
  return String(token || "").trim();
}

async function updateAccountDetails(
  req: Request<{}, {}, UpdateAccountRequest>,
  res: Response<UpdateAccountResponse>
): Promise<Response<UpdateAccountResponse>> {
  try {
    // ✅ get jwt token from header
    const jwt = getBearerToken(req);

    // ✅ find user using jwt token
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id, name, email, phone_number, jwt_token")
      .eq("jwt_token", jwt)
      .maybeSingle();

    if (userErr) throw userErr;

    if (!user) {
      return res.status(401).json({
        errorCode: "UNAUTHORIZED",
        message: "Invalid token / user not found",
      } as any);
    }

    const {
      operation = "UPDATE", // ✅ "UPDATE" | "DELETE_ADDRESS"

      firstName: rawFirstName,
      lastName: rawLastName,
      email: rawEmail,
      mobile: rawMobile,

      address: rawAddress,
      locality: rawLocality,
      pincode: rawPincode,
      city: rawCity,
      state: rawState,
      country: rawCountry,
    } = req.body as any;

    const firstName = clean(rawFirstName);
    const lastName = clean(rawLastName);
    const email = clean(rawEmail).toLowerCase();
    const mobile = clean(rawMobile);

    const address = clean(rawAddress);
    const locality = clean(rawLocality);
    const pincode = clean(rawPincode);
    const city = clean(rawCity);
    const state = clean(rawState);
    const country = clean(rawCountry);

    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

    const wantsProfileUpdate =
      rawFirstName !== undefined ||
      rawLastName !== undefined ||
      rawEmail !== undefined ||
      rawMobile !== undefined;

    const wantsAddressUpdate =
      rawAddress !== undefined ||
      rawLocality !== undefined ||
      rawPincode !== undefined ||
      rawCity !== undefined ||
      rawState !== undefined ||
      rawCountry !== undefined;

    // normalize for matching (treat null/undefined as "")
    const norm = (v: any) => String(v ?? "").trim().toLowerCase();
    const normPin = (v: any) => String(v ?? "").trim();

    // =====================================================
    // ✅ DELETE ADDRESS (match by full address, NO id)
    //    - Soft delete: set is_active=false, is_default=false
    //    - If deleted default: promote latest remaining as default
    // =====================================================
    if (operation === "DELETE_ADDRESS") {
      // user said: match by every field
      // (locality can be empty string; DB may have null => norm handles it)
      const hasDeleteFields =
        !!address && !!pincode && !!city && !!state && !!country && rawLocality !== undefined;

      if (!hasDeleteFields) {
        return res.status(400).json({
          errorCode: "INVALID_REQUEST",
          message:
            "For DELETE_ADDRESS you must send address, locality, pincode, city, state, country (locality can be empty string).",
        } as any);
      }

      // 1) load active addresses
      const { data: activeAddrs, error: listErr } = await supabase
        .from("user_addresses")
        .select(
          "id, address_line1, address_line2, postal_code, city, state, country, is_default, created_at"
        )
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (listErr) throw listErr;

      const match = (activeAddrs || []).find((a: any) => {
        return (
          norm(a.address_line1) === norm(address) &&
          norm(a.address_line2) === norm(locality) &&
          normPin(a.postal_code) === normPin(pincode) &&
          norm(a.city) === norm(city) &&
          norm(a.state) === norm(state) &&
          norm(a.country) === norm(country)
        );
      });

      if (!match) {
        return res.status(404).json({
          errorCode: "ADDRESS_NOT_FOUND",
          message: "Address not found for this user",
        } as any);
      }

      // 2) soft delete (✅ your table does NOT have updated_at, so don't update it)
      const { error: delErr } = await supabase
        .from("user_addresses")
        .update({
          is_active: false,
          is_default: false,
        })
        .eq("id", match.id);

      if (delErr) throw delErr;

      // 3) if we deleted default, set another default (latest remaining)
      if (match.is_default) {
        const remaining = (activeAddrs || [])
          .filter((a: any) => a.id !== match.id)
          .sort(
            (a: any, b: any) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

        const newDefault = remaining[0];
        if (newDefault?.id) {
          const { error: defErr } = await supabase
            .from("user_addresses")
            .update({ is_default: true })
            .eq("id", newDefault.id);

          if (defErr) throw defErr;
        }
      }

      // 4) return updated user + addresses
      const { data: userRow, error: uErr } = await supabase
        .from("users")
        .select("id, name, email, phone_number")
        .eq("id", user.id)
        .maybeSingle();
      if (uErr) throw uErr;

      const { data: allAddresses, error: aErr } = await supabase
        .from("user_addresses")
        .select(
          "id, address_line1, address_line2, postal_code, city, state, country, is_default"
        )
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (aErr) throw aErr;

      const nameParts = splitName(clean(userRow?.name));

      return res.json({
        errorCode: "NO_ERROR",
        message: "Address deleted successfully",
        userId: userRow?.id || user.id,
        user: {
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          email: clean(userRow?.email),
          mobile: clean(userRow?.phone_number),
        },
        addresses: (allAddresses || []).map((a: any) => ({
          id: String(a.id),
          address: clean(a.address_line1),
          locality: clean(a.address_line2),
          pincode: clean(a.postal_code),
          city: clean(a.city),
          state: clean(a.state),
          country: clean(a.country),
          isDefault: Boolean(a.is_default),
        })),
      } as any);
    }

    // =====================================================
    // ✅ UPDATE MODE (profile + address add/update default)
    // =====================================================
    if (!wantsProfileUpdate && !wantsAddressUpdate) {
      return res.status(400).json({
        errorCode: "INVALID_REQUEST",
        message: "No fields provided to update",
      } as any);
    }

    // -----------------------------------------------------
    // 1) UPDATE USERS
    // -----------------------------------------------------
    if (wantsProfileUpdate) {
      const userUpdate: any = { updated_at: new Date().toISOString() };

      const safeFullName =
        fullName || clean(user.name) || ""; // users.name can be null; allowed

      if (rawFirstName !== undefined || rawLastName !== undefined) {
        userUpdate.name = safeFullName; // can be ""
      }
      if (rawEmail !== undefined) userUpdate.email = email || null;
      if (rawMobile !== undefined) userUpdate.phone_number = mobile || null;

      const { error: updErr } = await supabase
        .from("users")
        .update(userUpdate)
        .eq("id", user.id);

      if (updErr) {
        const msg = updErr.message || "";
        const isDuplicate =
          (updErr as any).code === "23505" &&
          (msg.includes("users_email_key") || msg.toLowerCase().includes("email"));

        if (isDuplicate) {
          return res.status(409).json({
            errorCode: "EMAIL_IN_USE",
            message: "This email is already in use.",
          } as any);
        }
        throw updErr;
      }
    }

    // -----------------------------------------------------
    // 2) ADDRESS:
    //    ✅ If incoming differs from current default -> INSERT new as default
    //    ✅ Else UPDATE existing default
    //
    // NOTE: your user_addresses table has:
    // - full_name NOT NULL
    // - phone_number nullable
    // - created_at only (no updated_at)
    // -----------------------------------------------------
    if (wantsAddressUpdate) {
      const { data: existingAddr, error: findAddrErr } = await supabase
        .from("user_addresses")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .eq("is_default", true)
        .maybeSingle();

      if (findAddrErr) throw findAddrErr;

      const incoming = {
        address_line1:
          rawAddress !== undefined ? (address || "") : (existingAddr?.address_line1 ?? ""),
        address_line2:
          rawLocality !== undefined ? (locality || "") : (existingAddr?.address_line2 ?? ""),
        postal_code:
          rawPincode !== undefined ? (pincode || "") : (existingAddr?.postal_code ?? ""),
        city: rawCity !== undefined ? (city || "") : (existingAddr?.city ?? ""),
        state: rawState !== undefined ? (state || "") : (existingAddr?.state ?? ""),
        country: rawCountry !== undefined ? (country || "") : (existingAddr?.country ?? ""),
      };

      const isDifferentFromDefault = !existingAddr
        ? true
        : norm(incoming.address_line1) !== norm(existingAddr.address_line1) ||
        norm(incoming.address_line2) !== norm(existingAddr.address_line2) ||
        normPin(incoming.postal_code) !== normPin(existingAddr.postal_code) ||
        norm(incoming.city) !== norm(existingAddr.city) ||
        norm(incoming.state) !== norm(existingAddr.state) ||
        norm(incoming.country) !== norm(existingAddr.country);

      // full_name is NOT NULL in table, so always provide something non-empty
      const safeNameForAddress =
        fullName || clean(user.name) || clean(existingAddr?.full_name);

      const commonPayload: any = {
        full_name: safeNameForAddress,
        phone_number: mobile || existingAddr?.phone_number || user.phone_number || null,

        address_line1: incoming.address_line1,
        address_line2: incoming.address_line2 || null, // store null if empty
        city: incoming.city,
        state: incoming.state,
        country: incoming.country,
        postal_code: incoming.postal_code,

        is_active: true,
      };

      if (isDifferentFromDefault) {
        // 1) unset previous default
        if (existingAddr?.id) {
          const { error: unsetErr } = await supabase
            .from("user_addresses")
            .update({ is_default: false })
            .eq("id", existingAddr.id);

          if (unsetErr) throw unsetErr;
        }

        // 2) insert new as default
        const { error: insErr } = await supabase.from("user_addresses").insert({
          user_id: user.id,
          ...commonPayload,
          is_default: true,
        });

        if (insErr) throw insErr;
      } else {
        // same address => update existing default
        if (!existingAddr?.id) {
          const { error: insErr } = await supabase.from("user_addresses").insert({
            user_id: user.id,
            ...commonPayload,
            is_default: true,
          });
          if (insErr) throw insErr;
        } else {
          const { error: updAddrErr } = await supabase
            .from("user_addresses")
            .update({ ...commonPayload, is_default: true })
            .eq("id", existingAddr.id);

          if (updAddrErr) throw updAddrErr;
        }
      }
    }

    // -----------------------------------------------------
    // 3) FETCH UPDATED + RETURN ALL ADDRESSES
    // -----------------------------------------------------
    const { data: userRow, error: uErr } = await supabase
      .from("users")
      .select("id, name, email, phone_number")
      .eq("id", user.id)
      .maybeSingle();
    if (uErr) throw uErr;

    const { data: allAddresses, error: aErr } = await supabase
      .from("user_addresses")
      .select("id, address_line1, address_line2, postal_code, city, state, country, is_default")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (aErr) throw aErr;

    const nameParts = splitName(clean(userRow?.name));

    return res.json({
      errorCode: "NO_ERROR",
      message: "Account updated successfully",
      userId: userRow?.id || user.id,
      user: {
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        email: clean(userRow?.email),
        mobile: clean(userRow?.phone_number),
      },
      addresses: (allAddresses || []).map((a: any) => ({
        id: String(a.id),
        address: clean(a.address_line1),
        locality: clean(a.address_line2),
        pincode: clean(a.postal_code),
        city: clean(a.city),
        state: clean(a.state),
        country: clean(a.country),
        isDefault: Boolean(a.is_default),
      })),
    } as any);
  } catch (e: any) {
    console.error("updateAccountDetails error:", e);
    return res.status(500).json({
      errorCode: "SERVER_ERROR",
      message: e.message || "Something went wrong",
    } as any);
  }
}



export {
  getAllUsers,
  loginWithSessionId,
  otpAuth,
  signout,
  createLead,
  updateAccountDetails
};

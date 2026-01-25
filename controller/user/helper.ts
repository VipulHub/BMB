import type { Request, Response } from "express";
import supabase from "../../config/db.config.ts";
import { emitter } from "../../utils/emiter.ts";
import { generateOTP } from "../../utils/utils.ts";
import { client } from "../../config/twerlio.ts";
import type {
  getAllUserData,
  OtpAuthRequest,
  OtpAuthResponse,
  SignLoginResponse,
  SignOutResponse,
} from "./types.ts";

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

/* ===============================
   LOGIN → SEND OTP
================================ */
/* ===============================
   LOGIN WITH SESSION ID
================================ */
async function loginWithSessionId(
  req: Request<{}, {}, { userId: string }>,
  res: Response<SignLoginResponse>
): Promise<Response<SignLoginResponse>> {
  try {
    const { userId: sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        errorCode: "INVALID_REQUEST",
        message: "Session ID is required",
      });
    }

    /* ---------- 1️⃣ Check if user exists by session_id ---------- */
    let { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    /* ---------- 2️⃣ Create user if not exists ---------- */
    if (!user) {
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({
          session_id: sessionId,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;
      user = newUser;
    }

    /* ---------- 3️⃣ Transfer cart if exists for session ---------- */
    const { data: cart } = await supabase
      .from("carts")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (cart) {
      // Update cart to attach to user
      await supabase
        .from("carts")
        .update({
          user_id: user.id,
          session_id: null, // remove session once attached
          updated_at: new Date().toISOString(),
        })
        .eq("id", cart.id);
    }

    /* ---------- 4️⃣ Fetch default address ---------- */
    const { data: address } = await supabase
      .from("user_addresses")
      .select(`
        address_line1,
        address_line2,
        postal_code,
        city,
        state,
        country
      `)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("is_default", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    /* ---------- 5️⃣ Prepare response ---------- */
    const [firstName, ...lastNameParts] = (user.name || "").split(" ");

    return res.json({
      errorCode: "NO_ERROR",
      message: "Login successful",
      userId: user.id,
      user: {
        firstName: firstName || "",
        lastName: lastNameParts.join(" ") || "",
        email: user.email || "",
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
      errorCode: "SERVER_ERROR",
      message: e.message,
    });
  }
}

/* ===============================
   OTP AUTH / VERIFY OTP
================================ */
async function otpAuth(
  req: Request<{}, {}, OtpAuthRequest>,
  res: Response<OtpAuthResponse>
): Promise<Response<OtpAuthResponse>> {
  try {
    emitter.emit("log", {
      msg: `Controller Initialize for ${otpAuth.name}`,
      level: "info",
    });

    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        errorCode: "INVALID_REQUEST",
        error: "OTP is required",
      });
    }

    /* ---------- FETCH OTP ---------- */
    const { data: otpRecord, error } = await supabase
      .from("user_otps")
      .select("*")
      .eq("otp", otp)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !otpRecord) {
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

    /* ---------- FETCH USER ---------- */
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, name, email")
      .eq("id", otpRecord.user_id)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        errorCode: "USER_NOT_FOUND",
        error: "User not found",
      });
    }

    const [firstName, ...lastNameParts] = (user.name || "").split(" ");

    /* ---------- FETCH DEFAULT ADDRESS ---------- */
    const { data: address } = await supabase
      .from("user_addresses")
      .select(
        `
        address_line1,
        address_line2,
        postal_code,
        city,
        state,
        country
      `
      )
      .eq("user_id", otpRecord.user_id)
      .eq("is_active", true)
      .eq("is_default", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    /* ---------- DELETE OTP ---------- */
    await supabase.from("user_otps").delete().eq("id", otpRecord.id);

    /* ---------- RESPONSE ---------- */
    return res.json({
      errorCode: "NO_ERROR",
      message: "OTP verified successfully",
      userId: otpRecord.user_id,
      user: {
        firstName: firstName || '',
        lastName: lastNameParts.join(" ") || '',
        email: user.email || '',
      },
      address: address
        ? {
          address: address.address_line1 || '',
          locality: address.address_line2 || '',
          pincode: address.postal_code || '',
          city: address.city || '',
          state: address.state || '',
          country: address.country || '',
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

export {
  getAllUsers,
  loginWithSessionId,
  otpAuth,
  signout,
};

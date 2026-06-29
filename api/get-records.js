import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

// Distinct error codes the UI uses to render the right "fix me" message
// instead of a generic "System Offline". Keep these in sync with the
// switch statement in app.html's bootstrap catch.
const ERR = {
  METHOD_NOT_ALLOWED: { status: 405, message: "Method Not Allowed" },
  UNAUTHORIZED: { status: 401, message: "Sign in required." },
  PROFILE_FETCH_FAILED: {
    status: 500,
    message: "Could not load your account profile.",
  },
  SHEET_NOT_CONNECTED: {
    status: 400,
    message: "No Google Sheet connected to this account.",
  },
  MISSING_ENV: { status: 500, message: "Server configuration error." },
  SHEET_FORBIDDEN: {
    status: 403,
    message: "Sheet is not shared with the service account.",
  },
  SHEET_NOT_FOUND: {
    status: 404,
    message: "Sheet not found — check the Sheet ID.",
  },
  INTERNAL_ERROR: { status: 500, message: "Internal error." },
};
function fail(res, code, extra = {}) {
  const def = ERR[code];
  return res
    .status(def.status)
    .json({ error: def.message, code, ...extra });
}

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, "METHOD_NOT_ALLOWED");

  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return fail(res, "UNAUTHORIZED");

    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    // RLS ensures only their own row is returned.
    const { data: profile, error: profileError } = await sb
      .from("companies")
      .select("sheet_id")
      .single();

    if (profileError) return fail(res, "PROFILE_FETCH_FAILED");
    if (!profile?.sheet_id) return fail(res, "SHEET_NOT_CONNECTED");

    const rawKey = process.env.GOOGLE_PRIVATE_KEY;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    if (!rawKey || !clientEmail) return fail(res, "MISSING_ENV");

    const formattedKey = rawKey.replace(/\\n/g, "\n");

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: formattedKey },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // googleapis throws an object with .code or .response.status carrying
    // the actual HTTP status from Google. Map 403/404 to the matching UI
    // codes so the user sees the precise fix they need.
    let response;
    try {
      response = await sheets.spreadsheets.values.get({
        spreadsheetId: profile.sheet_id,
        range: "Sheet1!A:M",
      });
    } catch (sheetErr) {
      const status = sheetErr.code || sheetErr.response?.status;
      if (status === 403) {
        return fail(res, "SHEET_FORBIDDEN", { serviceAccount: clientEmail });
      }
      if (status === 404) {
        return fail(res, "SHEET_NOT_FOUND");
      }
      throw sheetErr;
    }

    const rows = response.data.values;
    if (!rows || rows.length <= 1) return res.status(200).json([]);

    // Columns H–M are premium-only and absent on older 7-column sheets — they
    // default to "N/A" so legacy sheets keep reading without errors.
    const data = rows.slice(1).map((row) => ({
      date: row[0] || "N/A",
      sender: row[1] || "N/A",
      receiver: row[2] || "N/A",
      tracking_number: row[3] || "N/A",
      description: row[4] || "N/A",
      receiver_phone: row[5] || "N/A",
      landmark: row[6] || "N/A",
      weight: row[7] || "N/A",
      delivery_address: row[8] || "N/A",
      origin: row[9] || "N/A",
      destination: row[10] || "N/A",
      delivery_fee: row[11] || "N/A",
      payment_status: row[12] || "N/A",
    }));

    res.status(200).json(data);
  } catch (error) {
    console.error("get-records INTERNAL_ERROR:", error.message);
    return fail(res, "INTERNAL_ERROR", { detail: error.message });
  }
}

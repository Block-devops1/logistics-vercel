import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method Not Allowed" });

  try {
    // 1. Get user session from Authorization header
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) throw new Error("Unauthorized: No session token.");

    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    // 2. Fetch sheet_id from Supabase — RLS ensures only their own row is returned
    const { data: profile, error: profileError } = await sb
      .from("companies")
      .select("sheet_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.sheet_id) {
      throw new Error("No spreadsheet connected to this account.");
    }

    const sheetId = profile.sheet_id;

    // 3. Validate env vars
    const rawKey = process.env.GOOGLE_PRIVATE_KEY;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

    if (!rawKey || !clientEmail) {
      throw new Error(
        `Missing Env Vars: Key:${!!rawKey}, Email:${!!clientEmail}`,
      );
    }

    const formattedKey = rawKey.replace(/\\n/g, "\n");

    // 4. Read from the user's own sheet
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: formattedKey,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Sheet1!A:E",
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      return res.status(200).json([]);
    }

    const data = rows.slice(1).map((row) => ({
      date: row[0] || "N/A",
      sender: row[1] || "N/A",
      receiver: row[2] || "N/A",
      tracking_number: row[3] || "N/A",
      description: row[4] || "N/A",
    }));

    res.status(200).json(data);
  } catch (error) {
    console.error("DETAILED ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
}

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method Not Allowed" });

  try {
    // 1. Authenticate the user from the Authorization header
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) throw new Error("Unauthorized: No session token.");

    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    const user = userData?.user || userData;
    if (userErr || !user) throw new Error("Unauthorized: Invalid session.");

    // 2. Validate the new sheet ID. Google Sheet IDs are the long token in the
    //    URL (…/d/<ID>/edit) — accept the raw ID or pull it out of a full URL.
    let sheetId = (req.body?.sheet_id || "").trim();
    const urlMatch = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch) sheetId = urlMatch[1];

    if (!sheetId || !/^[a-zA-Z0-9-_]{20,}$/.test(sheetId)) {
      return res.status(400).json({
        error:
          "That doesn't look like a valid Google Sheet ID. Paste the ID from the sheet's URL.",
      });
    }

    // 3. Persist to the caller's own row (RLS restricts the update to themselves)
    const { error: updateErr } = await sb
      .from("companies")
      .update({ sheet_id: sheetId })
      .eq("id", user.id);

    if (updateErr) throw new Error(updateErr.message);

    return res.status(200).json({ message: "Sheet ID updated.", sheet_id: sheetId });
  } catch (error) {
    console.error("update-sheet error:", error.message);
    const status = error.message?.startsWith("Unauthorized") ? 401 : 500;
    return res.status(status).json({ error: error.message });
  }
}

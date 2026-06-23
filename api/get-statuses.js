import { createClient } from "@supabase/supabase-js";

// Returns the caller's tracking-number → status map. Used by app.html to overlay
// statuses onto Google-Sheets-backed record cards. Authenticated (the caller
// only ever sees their own company_id's rows).

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method Not Allowed" });

  try {
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

    // Service-role read scoped by company_id — no dependence on waybill_index
    // RLS policy state, and we still only ever return the caller's own rows.
    const sbAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const { data, error } = await sbAdmin
      .from("waybill_index")
      .select("tracking_number, status, status_updated_at")
      .eq("company_id", user.id);

    if (error) throw new Error(error.message);

    return res.status(200).json(data || []);
  } catch (error) {
    console.error("get-statuses error:", error.message);
    const status = error.message?.startsWith("Unauthorized") ? 401 : 500;
    return res.status(status).json({ error: error.message });
  }
}
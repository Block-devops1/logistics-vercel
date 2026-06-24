import { createClient } from "@supabase/supabase-js";

// Allowed delivery statuses. Kept in sync with verify.html / app.html labels.
const ALLOWED = ["registered", "picked_up", "out_for_delivery", "delivered"];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method Not Allowed" });

  try {
    // 1. Authenticate the courier from the Authorization header
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

    // 2. Validate inputs
    const tracking = String(req.body?.tracking_number || "").trim();
    const status = String(req.body?.status || "").trim();
    if (!tracking) return res.status(400).json({ error: "Missing tracking number." });
    if (!ALLOWED.includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    // 3. Update with the service-role client, scoped by ownership. The
    //    company_id filter means a courier can only ever update their own
    //    shipments — another account's tracking number matches zero rows.
    const sbAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const { data: updated, error: updateErr } = await sbAdmin
      .from("waybill_index")
      .update({ status, status_updated_at: new Date().toISOString() })
      .eq("tracking_number", tracking)
      .eq("company_id", user.id)
      .select("tracking_number, status, status_updated_at");

    if (updateErr) throw new Error(updateErr.message);
    if (!updated || updated.length === 0) {
      return res
        .status(404)
        .json({ error: "Tracking number not found for your account." });
    }

    return res.status(200).json({ message: "Status updated.", record: updated[0] });
  } catch (error) {
    console.error("update-status error:", error.message);
    const status = error.message?.startsWith("Unauthorized") ? 401 : 500;
    return res.status(status).json({ error: error.message });
  }
}

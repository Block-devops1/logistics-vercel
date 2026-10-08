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

    // 2. Validate inputs. Accepts one tracking_number, or a list of up to 100
    //    in tracking_numbers (bulk "mark selected as ...").
    const status = String(req.body?.status || "").trim();
    if (!ALLOWED.includes(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    const bulk = Array.isArray(req.body?.tracking_numbers);
    let list = bulk ? req.body.tracking_numbers : [req.body?.tracking_number];
    list = [
      ...new Set(
        list
          .map((t) => String(t ?? "").trim())
          .filter((t) => t && t !== "N/A" && t.length <= 64),
      ),
    ];
    if (list.length === 0) {
      return res.status(400).json({ error: "Missing tracking number." });
    }
    if (list.length > 100) {
      return res
        .status(400)
        .json({ error: "Please update 100 records or fewer at a time." });
    }

    // 3. Update with the service-role client, scoped by ownership. The
    //    company_id filter means a courier can only ever update their own
    //    shipments: another account's tracking numbers match zero rows.
    const sbAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const { data: updated, error: updateErr } = await sbAdmin
      .from("waybill_index")
      .update({ status, status_updated_at: new Date().toISOString() })
      .in("tracking_number", list)
      .eq("company_id", user.id)
      .select("tracking_number, status, status_updated_at");

    if (updateErr) throw new Error(updateErr.message);
    if (!updated || updated.length === 0) {
      return res
        .status(404)
        .json({ error: "Tracking number not found for your account." });
    }

    if (!bulk) {
      return res
        .status(200)
        .json({ message: "Status updated.", record: updated[0] });
    }

    const found = new Set(updated.map((u) => u.tracking_number));
    return res.status(200).json({
      message: `${updated.length} updated.`,
      updated,
      count: updated.length,
      not_found: list.filter((t) => !found.has(t)),
    });
  } catch (error) {
    console.error("update-status error:", error.message);
    const status = error.message?.startsWith("Unauthorized") ? 401 : 500;
    return res.status(status).json({ error: error.message });
  }
}

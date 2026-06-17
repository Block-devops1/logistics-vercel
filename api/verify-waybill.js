import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

// Public endpoint — no auth. Given a tracking number, finds which company's
// sheet it belongs to (we store a lightweight index in Supabase) and returns
// only safe, non-sensitive confirmation fields.

export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method Not Allowed" });

  const tracking = (req.query.tracking || "").trim();
  if (!tracking) {
    return res.status(400).json({ error: "Missing tracking number" });
  }

  try {
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // Lightweight public index table: waybill_index(tracking_number, company_id, created_at)
    // Populated by analyze.js whenever a new extraction is saved (see step 2 below).
    const { data: indexRow, error: indexErr } = await sb
      .from("waybill_index")
      .select("company_id, created_at")
      .eq("tracking_number", tracking)
      .single();

    if (indexErr || !indexRow) {
      return res.status(404).json({ found: false });
    }

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("company_name")
      .eq("id", indexRow.company_id)
      .single();

    if (companyErr || !company) {
      return res.status(404).json({ found: false });
    }

    return res.status(200).json({
      found: true,
      tracking_number: tracking,
      company_name: company.company_name,
      created_at: indexRow.created_at,
    });
  } catch (error) {
    console.error("verify-waybill error:", error.message);
    return res.status(500).json({ error: "Verification service error" });
  }
}

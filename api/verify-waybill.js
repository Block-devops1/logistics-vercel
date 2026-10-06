import { createClient } from "@supabase/supabase-js";

// Public endpoint — no auth. Given a tracking number, finds which company (or
// companies) registered it and returns only safe, non-sensitive confirmation
// fields. Tracking text comes from pasted waybills, so two companies can end
// up with the same ID; when that happens we return every match instead of
// guessing, and the page asks the visitor which company sent their parcel.

export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method Not Allowed" });

  res.setHeader("Cache-Control", "no-store");

  const tracking = String(req.query.tracking || "").trim();
  if (!tracking) {
    return res.status(400).json({ error: "Missing tracking number" });
  }
  if (tracking.length > 64) {
    return res.status(404).json({ found: false });
  }

  try {
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // waybill_index: one row per (company_id, tracking_number).
    const { data: rows, error: indexErr } = await sb
      .from("waybill_index")
      .select("company_id, created_at, status, status_updated_at")
      .eq("tracking_number", tracking)
      .order("created_at", { ascending: false })
      .limit(5);

    if (indexErr || !rows || rows.length === 0) {
      return res.status(404).json({ found: false });
    }

    const ids = [...new Set(rows.map((r) => r.company_id))];
    const { data: companies, error: companyErr } = await sb
      .from("companies")
      .select("id, company_name")
      .in("id", ids);

    if (companyErr || !companies || companies.length === 0) {
      return res.status(404).json({ found: false });
    }

    const nameById = Object.fromEntries(
      companies.map((c) => [c.id, c.company_name]),
    );

    // PII-free by design: company, stage, and when it was last advanced.
    // Falls back to "registered" for any legacy row without a status.
    const matches = rows
      .filter((r) => nameById[r.company_id])
      .map((r) => ({
        company_name: nameById[r.company_id],
        created_at: r.created_at,
        status: r.status || "registered",
        status_updated_at: r.status_updated_at || null,
      }));

    if (matches.length === 0) {
      return res.status(404).json({ found: false });
    }

    return res.status(200).json({
      found: true,
      tracking_number: tracking,
      ambiguous: matches.length > 1,
      matches,
      // Single-match fields kept at the top level for older clients.
      ...(matches.length === 1 ? matches[0] : {}),
    });
  } catch (error) {
    console.error("verify-waybill error:", error.message);
    return res.status(500).json({ error: "Verification service error" });
  }
}

import { createClient } from "@supabase/supabase-js";

// Serverless endpoint to receive base64 logo, upload to private storage,
// create a signed download URL and persist path to companies table.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const auth = req.headers.authorization || "";
    const token = auth.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    // verify user from token
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData || !userData.user)
      return res.status(401).json({ error: "Invalid token" });
    const uid = userData.user.id;

    const body = await new Promise((resolve, reject) => {
      let s = "";
      req.on("data", (chunk) => (s += chunk));
      req.on("end", () => {
        try {
          resolve(JSON.parse(s));
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });

    const { filename, content_type, data: b64 } = body || {};
    if (!filename || !b64)
      return res.status(400).json({ error: "Missing fields" });

    // ensure requester owns the company
    // ensure requester owns the company (id == auth user id)
    const { data: company, error: cErr } = await sb
      .from("companies")
      .select("id")
      .eq("id", uid)
      .single();
    if (cErr || !company)
      return res.status(404).json({ error: "Company not found" });

    const companyId = company.id;

    const path = `company-logos/${companyId}/${Date.now()}-${filename}`;

    const buffer = Buffer.from(b64, "base64");

    const { data: upData, error: upErr } = await sb.storage
      .from("company-logos")
      .upload(path, buffer, {
        contentType: content_type || "application/octet-stream",
        upsert: true,
      });
    if (upErr) return res.status(500).json({ error: upErr.message });

    // create signed download URL (1 hour)
    const { data: signed, error: sErr } = await sb.storage
      .from("company-logos")
      .createSignedUrl(upData.path, 60 * 60);
    if (sErr) return res.status(500).json({ error: sErr.message });

    // persist path & optional public URL (signed) to companies table
    const upd = await sb
      .from("companies")
      .update({
        logo_path: upData.path,
        logo_uploaded_at: new Date().toISOString(),
        logo_url: signed.signedUrl,
      })
      .eq("id", companyId);
    if (upd.error)
      console.warn("Failed to persist logo_path:", upd.error.message);

    return res.json({ url: signed.signedUrl, path: upData.path });
  } catch (err) {
    console.error("upload-logo error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}

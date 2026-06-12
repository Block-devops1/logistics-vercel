import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData || !userData.user)
      return res.status(401).json({ error: "Invalid token" });

    // Report presence (not values) of critical vars
    const present = {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      GOOGLE_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
      PAYSTACK_SECRET_KEY: !!process.env.PAYSTACK_SECRET_KEY,
      CRON_SECRET: !!process.env.CRON_SECRET,
    };

    return res.status(200).json({ present });
  } catch (err) {
    console.error("env-check error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}

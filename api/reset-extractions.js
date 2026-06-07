import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Verify secret key so only cron-job.org can trigger this
  const cronSecret = req.headers["x-cron-secret"];
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Use service role key to bypass RLS and update ALL free users
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const { error } = await sb
      .from("companies")
      .update({ extractions_used: 0 })
      .eq("tier", "free");

    if (error) throw new Error(error.message);

    return res.status(200).json({ message: "Reset successful." });
  } catch (error) {
    console.error("Reset error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

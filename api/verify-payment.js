import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const reference = req.body?.reference || req.query?.reference;
  const userId = req.body?.userId || req.query?.userId;

  if (!reference || !userId) {
    return res.status(400).json({ error: "Missing reference or userId" });
  }

  try {
    // 1. Verify payment with Paystack
    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    const paystackData = await paystackRes.json();

    if (!paystackData.status || paystackData.data.status !== "success") {
      if (req.method === "GET") return res.redirect(302, "/upgrade");
      return res.status(400).json({ error: "Payment not successful" });
    }

    // 2. Update user to premium in Supabase using service role (bypasses RLS)
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // Extend from the CURRENT expiry when renewing early, so a customer who
    // pays 7 days before lapsing keeps those 7 days (expiry Jul 23 + renew
    // Jul 16 → new expiry Aug 23, not Aug 16). Lapsed/first-time payments
    // start from today.
    const { data: existing } = await sb
      .from("companies")
      .select("premium_until")
      .eq("id", userId)
      .single();

    const now = new Date();
    const base =
      existing?.premium_until && new Date(existing.premium_until) > now
        ? new Date(existing.premium_until)
        : now;
    const premiumUntil = new Date(base);
    premiumUntil.setMonth(premiumUntil.getMonth() + 1);

    await sb
      .from("companies")
      .update({
        tier: "premium",
        premium_until: premiumUntil.toISOString(),
        paystack_ref: reference,
      })
      .eq("id", userId);

    // 3. Redirect to app if GET (from Paystack callback_url), or return JSON if POST
    if (req.method === "GET") return res.redirect(302, "/app");
    return res.status(200).json({ message: "Upgraded to premium!" });
  } catch (error) {
    console.error("Verify payment error:", error.message);
    if (req.method === "GET") return res.redirect(302, "/upgrade");
    return res.status(500).json({ error: error.message });
  }
}

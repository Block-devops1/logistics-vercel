import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { reference, userId } = req.body;
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
      return res.status(400).json({ error: "Payment not successful" });
    }

    // 2. Update user to premium in Supabase using service role (bypasses RLS)
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const premiumUntil = new Date();
    premiumUntil.setMonth(premiumUntil.getMonth() + 1);

    await sb
      .from("companies")
      .update({
        tier: "premium",
        premium_until: premiumUntil.toISOString(),
        paystack_ref: reference,
      })
      .eq("id", userId);

    return res.status(200).json({ message: "Upgraded to premium!" });
  } catch (error) {
    console.error("Verify payment error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

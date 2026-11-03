import { createClient } from "@supabase/supabase-js";

// Saves a company's brand colour. Only the 10 preset colours are accepted, so
// nobody can store an unreadable colour or odd text. The write uses the
// service role and is limited to the caller's own row.

const PALETTE = [
  "#f97316",
  "#2563eb",
  "#15803d",
  "#dc2626",
  "#7c3aed",
  "#0f766e",
  "#b45309",
  "#1c1917",
  "#1e3a8a",
  "#9f1239",
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://evueo.com.ng");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Please log in again." });

    const sbAnon = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user)
      return res.status(401).json({ error: "Please log in again." });

    const color = String(req.body?.brand_color || "")
      .trim()
      .toLowerCase();
    if (!PALETTE.includes(color)) {
      return res
        .status(400)
        .json({ error: "Choose one of the colours shown." });
    }

    const sbAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    const { error: updateErr } = await sbAdmin
      .from("companies")
      .update({ brand_color: color })
      .eq("id", user.id);
    if (updateErr) throw new Error(updateErr.message);

    return res
      .status(200)
      .json({ message: "Colour saved.", brand_color: color });
  } catch (error) {
    console.error("update-brand error:", error.message);
    return res
      .status(500)
      .json({ error: "Could not save the colour. Try again." });
  }
}

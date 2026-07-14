import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // 1. Get user session from Authorization header
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) throw new Error("Unauthorized: No session token.");

    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    // 2. Get user and fetch their profile
    // Verify the token explicitly server-side to avoid relying on client internals
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    const user = userData?.user || userData;
    if (userErr || !user) {
      console.error("analyze: auth getUser failed:", userErr);
      throw new Error("Unauthorized: Invalid session.");
    }

    const { data: profile, error: profileError } = await sb
      .from("companies")
      .select("sheet_id, tier, extractions_used, premium_until")
      .single();

    if (profileError || !profile?.sheet_id) {
      throw new Error("No spreadsheet connected to this account.");
    }

    const sheetId = profile.sheet_id;

    // Premium is only active while premium_until is in the future. A user who
    // paid once but whose month has lapsed falls back to free — without this
    // check, tier stays "premium" forever and the paywall never re-applies.
    const premiumActive =
      profile.tier === "premium" &&
      profile.premium_until &&
      new Date(profile.premium_until) > new Date();

    // Lazily downgrade an expired premium row so the badge, receipts, and model
    // selection all see "free" from now on (single source of truth = the DB).
    if (profile.tier === "premium" && !premiumActive) {
      await sb.from("companies").update({ tier: "free" }).eq("id", user.id);
    }

    // Enforce free tier limit
    const isFree = !premiumActive;
    const usedCount = profile.extractions_used || 0;
    if (isFree && usedCount >= 10) {
      return res.status(403).json({ error: "LIMIT_REACHED" });
    }

    // 3. Validate env vars and request body
    const { text } = req.body;
    if (!text) throw new Error("No text provided.");
    if (!process.env.GOOGLE_PRIVATE_KEY || !process.env.OPENROUTER_API_KEY) {
      throw new Error("Missing API Keys in Vercel Settings!");
    }

    // Manual money fields (premium only) — never AI-extracted, so the AI can
    // never print an invented amount on a financial document.
    const deliveryFee = premiumActive ? String(req.body.deliveryFee || "") : "";
    const paymentStatus = premiumActive
      ? String(req.body.paymentStatus || "")
      : "";

    const GOOGLE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");

    // 4. Call AI. Premium accounts extract extra descriptive fields (weight,
    // delivery address, origin/destination); free accounts get the base set.
    const premiumFields = premiumActive
      ? "Also extract these fields: weight, delivery_address, origin, destination. " +
        "weight is the parcel weight if stated (e.g. '5kg'), otherwise an empty string. " +
        "delivery_address is the receiver's full street/delivery address if given, otherwise an empty string. " +
        "origin is the pickup city/town and destination is the delivery city/town if mentioned, otherwise empty strings. " +
        "Never guess or invent any of these — return an empty string when not clearly present. "
      : "";

    const systemPrompt =
      "You are a logistics data extractor. The text contains business waybill information including names and addresses which are necessary for delivery purposes. Extract these fields: sender, receiver, tracking_number, description, receiver_phone, landmark. " +
      "receiver_phone is the recipient's phone number if mentioned, otherwise an empty string. " +
      "landmark is any delivery directions, nearby landmark, or drop-off instructions mentioned (e.g. 'opposite the central mosque, Mile 1, Diobu'), otherwise an empty string — do not repeat the phone number inside this field. " +
      premiumFields +
      "Return ONLY raw JSON. No markdown.";
    const aiResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://evueo.com.ng",
          "X-Title": "Evueo",
        },
        body: JSON.stringify({
          model: premiumActive ? "openrouter/auto" : "openrouter/free",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ],
        }),
      },
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text().catch(() => "<no body>");
      console.error(
        "OpenRouter non-OK response:",
        aiResponse.status,
        errorText,
      );
      throw new Error(`OpenRouter Error: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices[0].message.content;
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("AI returned invalid JSON: " + content);
    }

    const extracted = JSON.parse(content.substring(jsonStart, jsonEnd + 1));

    // 5. Write to the user's own sheet
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: GOOGLE_KEY,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const doc = new GoogleSpreadsheet(sheetId, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    // Auto-create / extend headers. New columns are appended at the end
    // (not inserted mid-sheet) so sheets created before phone/landmark
    // extraction existed stay backward-compatible.
    const headers = [
      "Date",
      "Sender",
      "Receiver",
      "Tracking Number",
      "Description",
      "Receiver Phone",
      "Landmark",
      "Weight",
      "Delivery Address",
      "Origin",
      "Destination",
      "Delivery Fee",
      "Payment Status",
    ];
    await sheet.loadHeaderRow().catch(async () => {
      await sheet.setHeaderRow(headers);
    });

    const hasAllHeaders =
      sheet.headerValues &&
      headers.every((h) => sheet.headerValues.includes(h));
    if (!hasAllHeaders) {
      await sheet.setHeaderRow(headers);
    }

    await sheet.addRow({
      Date: new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos" }),
      Sender: String(extracted.sender || "N/A"),
      Receiver: String(extracted.receiver || "N/A"),
      "Tracking Number": String(extracted.tracking_number || "N/A"),
      Description:
        typeof extracted.description === "object"
          ? JSON.stringify(extracted.description)
          : String(extracted.description || "N/A"),
      // Prefix phone with ' to force Google Sheets to treat as text (preserves leading 0)
      "Receiver Phone": extracted.receiver_phone
        ? "'" + String(extracted.receiver_phone)
        : "N/A",
      Landmark: String(extracted.landmark || "N/A"),
      // Premium-only columns. Blank for free accounts (premiumFields prompt was
      // empty, so these stay "") and for the manual fee/payment fields.
      // Clean origin/destination: strip stray quotes/apostrophes that the AI
      // sometimes picks up from punctuation in the raw text.
      Weight: String(extracted.weight || ""),
      "Delivery Address": String(extracted.delivery_address || ""),
      Origin: (extracted.origin || "")
        .trim()
        .replace(/^['"`]+|['"`]+$/g, ""),
      Destination: (extracted.destination || "")
        .trim()
        .replace(/^['"`]+|['"`]+$/g, ""),
      "Delivery Fee": deliveryFee,
      "Payment Status": paymentStatus,
    });

    // Index the tracking number for public verification (verify.evueo.com.ng)
    // Uses the service-role key (not the user's RLS-scoped `sb` client) since
    // this is a trusted server-side write — the user's identity was already
    // verified above, and we don't want a missing/misconfigured RLS policy
    // on waybill_index to silently drop the index row.
    if (extracted.tracking_number && extracted.tracking_number !== "N/A") {
      const sbAdmin = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      );
      // Upsert, not insert: re-analyzing the same waybill (common when a
      // merchant fixes a typo and pastes again) must not create a duplicate
      // row — duplicates make verify.html's .single() lookup fail, which
      // showed customers "not found" for a genuinely registered waybill.
      const { error: indexErr } = await sbAdmin.from("waybill_index").upsert(
        {
          tracking_number: String(extracted.tracking_number),
          company_id: user.id,
          status: "registered",
        },
        { onConflict: "tracking_number" },
      );
      if (indexErr) {
        console.error("waybill_index insert failed:", indexErr.message);
      }
    }

    // 6. Increment extraction counter
    await sb
      .from("companies")
      .update({ extractions_used: (profile.extractions_used || 0) + 1 })
      .eq("id", user.id);

    // Merge the manual fee/payment fields into the returned data so the client
    // can render them on the receipt without a second round-trip.
    const responseData = {
      ...extracted,
      delivery_fee: deliveryFee,
      payment_status: paymentStatus,
    };

    return res.status(200).json({ message: "Success!", data: responseData });
  } catch (error) {
    console.error("API Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 30 };
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
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) throw new Error("Unauthorized: Invalid session.");

    const { data: profile, error: profileError } = await sb
      .from("companies")
      .select("sheet_id, tier, extractions_used")
      .single();

    if (profileError || !profile?.sheet_id) {
      throw new Error("No spreadsheet connected to this account.");
    }

    const sheetId = profile.sheet_id;

    // Enforce free tier limit
    const isFree = !profile.tier || profile.tier === "free";
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

    const GOOGLE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");

    // 4. Call AI
    const systemPrompt =
      "You are a logistics data extractor. The text contains business waybill information including names and addresses which are necessary for delivery purposes. Extract these fields: sender, receiver, tracking_number, description. Return ONLY raw JSON. No markdown.";
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
          model:
            profile.tier === "premium"
              ? "google/gemini-2.0-flash-lite-001"
              : "openrouter/free",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ],
        }),
      },
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
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

    // Auto-create headers if sheet is empty
    const headers = [
      "Date",
      "Sender",
      "Receiver",
      "Tracking Number",
      "Description",
    ];
    await sheet.loadHeaderRow().catch(async () => {
      await sheet.setHeaderRow(headers);
    });

    if (!sheet.headerValues || sheet.headerValues.length === 0) {
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
    });

    // 6. Increment extraction counter
    await sb
      .from("companies")
      .update({ extractions_used: (profile.extractions_used || 0) + 1 })
      .eq("id", user.id);

    return res.status(200).json({ message: "Success!", data: extracted });
  } catch (error) {
    console.error("API Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

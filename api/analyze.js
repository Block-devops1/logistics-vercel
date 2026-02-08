import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export default async function handler(req, res) {
  // 1. CORS Headers (Keep these, they are good)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { text } = req.body;

    // 2. DEBUG: Check if Keys Exist (This prevents the "Silent Crash")
    if (!process.env.GOOGLE_PRIVATE_KEY || !process.env.OPENROUTER_API_KEY) {
      throw new Error("Missing API Keys in Vercel Settings!");
    }

    const GOOGLE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

    // 3. THE FIX: Add "HTTP-Referer" and "X-Title" headers
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ericss-logistics.vercel.app", // Required for Free Tier
        "X-Title": "Ericss Logistics", // Required for Free Tier
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free", // Using the free tier model
        messages: [
          { role: "system", content: "You are a data extractor. Extract these fields from the text: sender, receiver, tracking_number, description. Return ONLY raw JSON. No markdown formatting." }, 
          { role: "user", content: text }
        ]
      })
    });

    // 4. THE SAFETY NET: Check if OpenRouter is angry
    if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        throw new Error(`OpenRouter Error: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    
    // 5. ROBUST PARSING: Handle cases where AI adds markdown (```json ... ```)
    let content = aiData.choices[0].message.content;
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("AI returned invalid JSON: " + content);
    }
    
    const extracted = JSON.parse(content.substring(jsonStart, jsonEnd + 1));

    // 6. GOOGLE SHEETS SAVING (Unchanged)
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: GOOGLE_KEY,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    await sheet.addRow({
      "Date": new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos' }),
      "Sender": String(extracted.sender || "N/A"),
      "Receiver": String(extracted.receiver || "N/A"),
      "Tracking Number": String(extracted.tracking_number || "N/A"),
      "Description": typeof extracted.description === 'object' ? JSON.stringify(extracted.description) : String(extracted.description || "N/A")
    });

    return res.status(200).json({ message: "Success!", data: extracted });

  } catch (error) {
    console.error("API Error:", error.message); // Logs to Vercel Console
    return res.status(500).json({ error: error.message });
  }
}
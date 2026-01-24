import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { text } = req.body;
    const GOOGLE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [
          { role: "system", content: "Extract to JSON: sender, receiver, tracking_number, description. Respond ONLY with raw JSON." }, 
          { role: "user", content: text }
        ]
      })
    });

    const aiData = await aiResponse.json();
    const content = aiData.choices[0].message.content;
    const extracted = JSON.parse(content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1));

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
    return res.status(500).json({ error: error.message });
  }
}
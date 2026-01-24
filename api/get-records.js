import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    // 1. Get the raw key string from Vercel (using the name from your analyze.js)
    const rawKey = process.env.GOOGLE_PRIVATE_KEY;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    // 2. Safety Check: If any are missing, tell us exactly which one
    if (!rawKey || !clientEmail || !sheetId) {
      throw new Error(`Missing Env Vars: Key:${!!rawKey}, Email:${!!clientEmail}, ID:${!!sheetId}`);
    }

    // 3. Fix the formatting of the private key
    const formattedKey = rawKey.replace(/\\n/g, '\n');
    
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: formattedKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:E', 
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) { // Added check for empty sheet (only headers)
      return res.status(200).json([]);
    }

    const data = rows.slice(1).map(row => ({
      date: row[0] || 'N/A',
      sender: row[1] || 'N/A',
      receiver: row[2] || 'N/A',
      tracking_number: row[3] || 'N/A',
      description: row[4] || 'N/A'
    }));

    res.status(200).json(data);
  } catch (error) {
    console.error("DETAILED ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
}
import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    // Safety check for the Private Key newlines
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n');
    
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY).client_email,
        private_key: JSON.parse(privateKey).private_key,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Sheet1!A:E', 
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.status(200).json([]);
    }

    // This matches your headers: Date, Sender, Receiver, Tracking Number, Description
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
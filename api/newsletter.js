const https = require('https');

const SHEET_ID = '1VXEii1g1kAs4WqY1v9g5WMO0MB6SCO_JdjMAotC85qU';

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function getAccessToken() {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  }).toString();

  const res = await httpRequest({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(params) }
  }, params);

  return res.data.access_token;
}

async function getEmails(token) {
  const res = await httpRequest({
    hostname: 'sheets.googleapis.com',
    path: `/v4/spreadsheets/${SHEET_ID}/values/Subscribers!A:A`,
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  return (res.data.values || []).flat().map(e => e.toLowerCase());
}

async function appendRow(token, row) {
  const body = JSON.stringify({ values: [row] });
  return httpRequest({
    hostname: 'sheets.googleapis.com',
    path: `/v4/spreadsheets/${SHEET_ID}/values/Subscribers:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, body);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, source } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    const token = await getAccessToken();
    if (!token) return res.status(500).json({ error: 'Auth failed' });

    const emails = await getEmails(token);
    if (emails.includes(email.toLowerCase())) {
      return res.status(200).json({ success: true, message: 'already_subscribed' });
    }

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const referrer = req.headers['referer'] || req.headers['referrer'] || 'direct';
    const country = req.headers['x-vercel-ip-country'] || 'unknown';
    const city = req.headers['x-vercel-ip-city'] || 'unknown';
    const region = req.headers['x-vercel-ip-country-region'] || 'unknown';
    await appendRow(token, [email, source || 'unknown', new Date().toISOString(), ip, country, city, region, userAgent, referrer]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Newsletter error:', error.message || error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
};

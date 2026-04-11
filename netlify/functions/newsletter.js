// Netlify Function - newsletter signup → Google Sheets
// Ported from Vercel serverless function
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

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { email, source } = JSON.parse(event.body) || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid email required' }) };
    }

    const token = await getAccessToken();
    if (!token) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Auth failed' }) };

    const emails = await getEmails(token);
    if (emails.includes(email.toLowerCase())) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'already_subscribed' }) };
    }

    const ip = (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const userAgent = event.headers['user-agent'] || 'unknown';
    const referrer = event.headers['referer'] || event.headers['referrer'] || 'direct';
    
    // Netlify geo data from x-nf-geo header (replaces Vercel's x-vercel-ip-* headers)
    let country = 'unknown', city = 'unknown', region = 'unknown';
    try {
      const geo = JSON.parse(event.headers['x-nf-geo'] || '{}');
      country = geo.country?.code || 'unknown';
      city = geo.city || 'unknown';
      region = geo.subdivision?.code || 'unknown';
    } catch(e) {}

    await appendRow(token, [email, source || 'unknown', new Date().toISOString(), ip, country, city, region, userAgent, referrer]);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('Newsletter error:', error.message || error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Something went wrong' }) };
  }
};

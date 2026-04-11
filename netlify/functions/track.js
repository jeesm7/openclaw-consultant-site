// Netlify Function - forwards hot prospect events to webhook
// Ported from Vercel serverless function
const WEBHOOK_URL = process.env.PROSPECT_WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.PROSPECT_WEBHOOK_SECRET || '';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://openclawconsultant.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const data = JSON.parse(event.body);

    if (data.event !== 'hot_prospect') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid event' }) };
    }

    const visitorIp = (event.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || event.headers['x-real-ip']
      || 'unknown';

    const payload = {
      ...data,
      secret: WEBHOOK_SECRET,
      visitorIp,
      source: 'openclawconsultant.com',
    };

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('Webhook error:', await response.text());
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Webhook failed' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (error) {
    console.error('Track API error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};

// Vercel Serverless Function - forwards hot prospect events to webhook
const WEBHOOK_URL = process.env.PROSPECT_WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.PROSPECT_WEBHOOK_SECRET || '';

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://openclawconsultant.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const data = req.body;
    
    if (data.event !== 'hot_prospect') {
      return res.status(400).json({ error: 'Invalid event' });
    }
    
    // Extract real visitor IP
    const visitorIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers['x-real-ip']
      || 'unknown';
    
    // Forward to webhook with server-side secret + visitor IP
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
      return res.status(502).json({ error: 'Webhook failed' });
    }
    
    return res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Track API error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
};

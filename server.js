const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';

app.use(cors());
app.use(express.json());

const callLog = [];

// Health check — visit /health in browser to verify it's running
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    forwarding_to: N8N_WEBHOOK_URL ? 'SET ✓' : 'NOT SET ✗',
    calls_received: callLog.length
  });
});

// This is the endpoint URL you paste into Hunar
// It will be: https://YOUR-PROJECT-NAME.glitch.me/webhook
app.post('/webhook', async (req, res) => {
  const payload = req.body;
  const timestamp = new Date().toISOString();

  console.log('Received from Hunar:', JSON.stringify(payload));

  callLog.unshift({ timestamp, payload, forwarded: false, error: null });
  if (callLog.length > 200) callLog.pop();

  if (!N8N_WEBHOOK_URL) {
    callLog[0].error = 'N8N_WEBHOOK_URL not set in .env';
    return res.status(200).json({ received: true, forwarded: false, error: 'N8N_WEBHOOK_URL not configured' });
  }

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, bridge_received_at: timestamp })
    });

    if (response.ok) {
      callLog[0].forwarded = true;
      console.log('Forwarded to n8n OK');
      res.status(200).json({ received: true, forwarded: true });
    } else {
      const errText = await response.text();
      callLog[0].error = `n8n status ${response.status}: ${errText}`;
      res.status(200).json({ received: true, forwarded: false, n8n_status: response.status });
    }
  } catch (err) {
    callLog[0].error = err.message;
    console.error('Forward failed:', err.message);
    res.status(200).json({ received: true, forwarded: false, error: err.message });
  }
});

// Dashboard fetches this to show live log
app.get('/api/log', (req, res) => {
  res.json(callLog.slice(0, 50));
});

app.listen(PORT, () => {
  console.log('Bridge running on port', PORT);
  console.log('N8N_WEBHOOK_URL:', N8N_WEBHOOK_URL ? 'SET ✓' : 'NOT SET — add it to .env');
});

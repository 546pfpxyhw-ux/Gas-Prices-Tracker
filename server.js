const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { updatePrices } = require('./fetch-prices');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS headers for all responses
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '5m'
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manual price refresh (protected by secret key)
app.get('/api/refresh-prices', async (req, res) => {
  const secret = process.env.REFRESH_SECRET;
  if (!secret || req.query.key !== secret) {
    return res.status(403).json({ error: 'Invalid or missing key' });
  }
  try {
    await updatePrices();
    res.json({ status: 'ok', message: 'Prices refreshed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Gas Price Tracker server running on port ${PORT}`);

  // Fetch prices on startup
  updatePrices().catch(err => {
    console.error('Initial price fetch failed:', err.message);
  });
});

// Schedule daily fetches at 7:00 AM and 11:00 AM ET
['0 7 * * *', '0 11 * * *'].forEach(function(schedule) {
  cron.schedule(schedule, () => {
    console.log('Running scheduled gas price fetch...');
    updatePrices().catch(err => {
      console.error('Scheduled price fetch failed:', err.message);
    });
  }, {
    timezone: 'America/New_York'
  });
});

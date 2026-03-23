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

// Start server
app.listen(PORT, () => {
  console.log(`Gas Price Tracker server running on port ${PORT}`);

  // Fetch prices on startup
  updatePrices().catch(err => {
    console.error('Initial price fetch failed:', err.message);
  });
});

// Schedule daily fetch at 9:00 AM ET (after EIA publishes ~7:30-8:30 AM ET)
cron.schedule('0 9 * * *', () => {
  console.log('Running scheduled gas price fetch...');
  updatePrices().catch(err => {
    console.error('Scheduled price fetch failed:', err.message);
  });
}, {
  timezone: 'America/New_York'
});

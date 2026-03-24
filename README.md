# Gas Price Tracker

Self-updating embeddable widget displaying current U.S. gas prices with historical comparisons and IP-based local pricing.

## Architecture

- **Data Service** (`server.js`): Express app that fetches gas price data daily via cron and writes a static JSON file
- **Embed Widget** (`public/gas-prices.html`): Self-contained HTML/CSS/JS widget designed for iframe embedding

## Data Sources

1. **AAA** (primary) — Daily state-level gas price averages scraped via Scraping Fish. Provides all 50 states + DC.
2. **EIA API v2** (fallback + baselines) — Weekly retail gasoline prices by PADD region. Used for historical comparison baselines (inauguration + Iran war dates) and as fallback if AAA scraping fails.

## Setup

1. Get a [Scraping Fish API key](https://scrapingfish.com) for AAA data
2. Optionally register for a free [EIA API key](https://www.eia.gov/opendata/register.php) as fallback
3. Set environment variables:
   - `SCRAPING_FISH_API_KEY=your_key` (required)
   - `EIA_API_KEY=your_key` (optional fallback)
4. Install and run:

```bash
npm install
npm start
```

## Endpoints

- `/gas-prices.html` — Embed widget
- `/data/gas-prices.json` — Current price data (auto-updated daily)
- `/health` — Health check

## Embed Code

Paste both snippets into your CMS article. The iframe loads the widget; the script auto-resizes it to fit.

```html
<iframe
  id="gas-tracker"
  src="https://[YOUR-URL]/gas-prices.html"
  width="100%"
  style="max-width: 650px; border: none; overflow: hidden;"
  height="900"
  title="U.S. Gas Price Tracker"
  loading="lazy"
></iframe>
<script>
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'gas-tracker-resize') {
    document.getElementById('gas-tracker').style.height = e.data.height + 'px';
  }
});
</script>
```

## Features

- **IP-based local prices**: The widget uses [ip-api.com](http://ip-api.com) to detect the reader's state and show a personalized local gas price. Falls back gracefully to national-only if geolocation fails or is rate-limited.
- **Splashy % change badges**: Large, glowing percentage badges with pop-in animation
- **Two historical comparisons**: Inauguration day (Jan 20, 2025) and Iran war (Feb 27, 2026)
- **Regional breakdown**: 5 PADD regions with current prices and change indicators

## Deployment

Deploy to Railway via GitHub. Set `SCRAPING_FISH_API_KEY` and optionally `EIA_API_KEY` as environment variables in Railway settings.

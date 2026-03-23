# Gas Price Tracker

Self-updating embeddable widget displaying current U.S. national gas prices with historical comparisons.

## Architecture

- **Data Service** (`server.js`): Express app that fetches EIA gas price data daily via cron and writes a static JSON file
- **Embed Widget** (`public/gas-prices.html`): Self-contained HTML/CSS/JS widget designed for iframe embedding

## Setup

1. Register for a free EIA API key at https://www.eia.gov/opendata/register.php
2. Set the environment variable: `EIA_API_KEY=your_key`
3. Install and run:

```bash
npm install
npm start
```

## Endpoints

- `/gas-prices.html` — Embed widget
- `/data/gas-prices.json` — Current price data (auto-updated daily)
- `/health` — Health check

## Embed Code

```html
<iframe
  src="https://[YOUR-URL]/gas-prices.html"
  width="100%"
  style="max-width: 650px; border: none; overflow: hidden;"
  height="620"
  title="U.S. Gas Price Tracker"
  loading="lazy"
></iframe>
```

## Deployment

Deploy to Railway via GitHub. Set `EIA_API_KEY` as an environment variable in Railway settings.

## Data Source

U.S. Energy Information Administration (EIA) API v2 — weekly retail gasoline prices (regular grade, all formulations).

const fs = require('fs');
const path = require('path');

const EIA_API_KEY = process.env.EIA_API_KEY;
const DATA_FILE = path.join(__dirname, 'public', 'data', 'gas-prices.json');

// Hardcoded baseline prices from EIA data
// Week of January 20, 2025 (inauguration)
const INAUGURATION_BASELINES = {
  date: '2025-01-20',
  NUS: 3.107,
  R10: 3.062,
  R20: 2.925,
  R30: 2.679,
  R40: 2.946,
  R50: 3.915
};

// Week of February 24, 2026 (closest to Feb 27, 2026 — Iran war)
const IRAN_WAR_BASELINES = {
  date: '2026-02-27',
  NUS: 3.065,
  R10: 3.018,
  R20: 2.877,
  R30: 2.637,
  R40: 2.874,
  R50: 3.891
};

const REGIONS = [
  { name: 'East Coast', id: 'R10' },
  { name: 'Midwest', id: 'R20' },
  { name: 'Gulf Coast', id: 'R30' },
  { name: 'Rocky Mountain', id: 'R40' },
  { name: 'West Coast', id: 'R50' }
];

async function fetchEIAPrices() {
  const duoAreas = ['NUS', 'R10', 'R20', 'R30', 'R40', 'R50'];
  const duoAreaParams = duoAreas.map(d => `facets[duoarea][]=${d}`).join('&');

  const url = `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${EIA_API_KEY}&frequency=weekly&data[0]=value&${duoAreaParams}&facets[product][]=EPM0&sort[0][column]=period&sort[0][direction]=desc&length=${duoAreas.length}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`EIA API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.response || !data.response.data || data.response.data.length === 0) {
    throw new Error('EIA API returned no data');
  }

  const prices = {};
  let eiaDataDate = null;

  for (const row of data.response.data) {
    const area = row.duoarea;
    const price = parseFloat(row.value);
    if (!isNaN(price)) {
      prices[area] = price;
      if (!eiaDataDate) {
        eiaDataDate = row.period;
      }
    }
  }

  return { prices, eiaDataDate };
}

function round(val, decimals = 3) {
  return Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function buildJSON(currentPrices, eiaDataDate) {
  const national = currentPrices.NUS;

  const regions = REGIONS.map(region => ({
    name: region.name,
    id: region.id,
    current: currentPrices[region.id],
    inauguration: INAUGURATION_BASELINES[region.id],
    iranWar: IRAN_WAR_BASELINES[region.id]
  }));

  return {
    lastUpdated: new Date().toISOString(),
    eiaDataDate,
    national: {
      current: national,
      inauguration: {
        price: INAUGURATION_BASELINES.NUS,
        date: INAUGURATION_BASELINES.date,
        label: 'How U.S. gas prices have changed since Trump took office for his second term'
      },
      iranWar: {
        price: IRAN_WAR_BASELINES.NUS,
        date: IRAN_WAR_BASELINES.date,
        label: 'How U.S. gas prices have changed since Trump went to war with Iran'
      }
    },
    regions
  };
}

async function updatePrices() {
  console.log(`[${new Date().toISOString()}] Fetching gas prices from EIA...`);

  try {
    const { prices, eiaDataDate } = await fetchEIAPrices();
    const json = buildJSON(prices, eiaDataDate);

    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(json, null, 2));

    console.log(`[${new Date().toISOString()}] Gas prices updated successfully. EIA data date: ${eiaDataDate}`);
    return json;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching gas prices:`, err.message);

    // Keep the previous JSON file if it exists
    if (fs.existsSync(DATA_FILE)) {
      console.log('Keeping previous data file.');
    }
    throw err;
  }
}

// Allow running directly
if (require.main === module) {
  updatePrices().catch(() => process.exit(1));
}

module.exports = { updatePrices };

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const EIA_API_KEY = process.env.EIA_API_KEY;
const SCRAPING_FISH_API_KEY = process.env.SCRAPING_FISH_API_KEY;
const DATA_FILE = path.join(__dirname, 'public', 'data', 'gas-prices.json');

// --- Hardcoded EIA baseline prices (these never change) ---

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

// --- State-to-PADD region mapping ---
const STATE_TO_PADD = {
  'Connecticut': 'R10', 'Delaware': 'R10', 'District of Columbia': 'R10',
  'Florida': 'R10', 'Georgia': 'R10', 'Maine': 'R10', 'Maryland': 'R10',
  'Massachusetts': 'R10', 'New Hampshire': 'R10', 'New Jersey': 'R10',
  'New York': 'R10', 'North Carolina': 'R10', 'Pennsylvania': 'R10',
  'Rhode Island': 'R10', 'South Carolina': 'R10', 'Vermont': 'R10',
  'Virginia': 'R10', 'West Virginia': 'R10',
  'Illinois': 'R20', 'Indiana': 'R20', 'Iowa': 'R20', 'Kansas': 'R20',
  'Kentucky': 'R20', 'Michigan': 'R20', 'Minnesota': 'R20', 'Missouri': 'R20',
  'Nebraska': 'R20', 'North Dakota': 'R20', 'Ohio': 'R20', 'Oklahoma': 'R20',
  'South Dakota': 'R20', 'Tennessee': 'R20', 'Wisconsin': 'R20',
  'Alabama': 'R30', 'Arkansas': 'R30', 'Louisiana': 'R30', 'Mississippi': 'R30',
  'New Mexico': 'R30', 'Texas': 'R30',
  'Colorado': 'R40', 'Idaho': 'R40', 'Montana': 'R40', 'Utah': 'R40',
  'Wyoming': 'R40',
  'Alaska': 'R50', 'Arizona': 'R50', 'California': 'R50', 'Hawaii': 'R50',
  'Nevada': 'R50', 'Oregon': 'R50', 'Washington': 'R50'
};

const REGIONS = [
  { name: 'East Coast', id: 'R10' },
  { name: 'Midwest', id: 'R20' },
  { name: 'Gulf Coast', id: 'R30' },
  { name: 'Rocky Mountain', id: 'R40' },
  { name: 'West Coast', id: 'R50' }
];

// --- AAA Scraping via Scraping Fish ---

async function fetchAAAPrices() {
  if (!SCRAPING_FISH_API_KEY) {
    throw new Error('SCRAPING_FISH_API_KEY not set');
  }

  const targetUrl = 'https://gasprices.aaa.com/state-gas-price-averages/';
  const apiUrl = `https://api.scrapingfish.com/api/v1/?api_key=${SCRAPING_FISH_API_KEY}&url=${encodeURIComponent(targetUrl)}`;

  console.log('Fetching AAA gas prices via Scraping Fish...');
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Scraping Fish returned ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  return parseAAAHtml(html);
}

function parseAAAHtml(html) {
  const $ = cheerio.load(html);
  const states = {};
  let nationalAvg = null;

  // AAA's state averages page has a table with columns:
  // State | Regular | Mid-Grade | Premium | Diesel
  // Try multiple selector strategies for resilience

  // Strategy 1: Look for table rows with state data
  $('table tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length >= 2) {
      const stateName = $(cells[0]).text().trim();
      const regularPrice = parseFloat($(cells[1]).text().trim().replace('$', ''));

      if (stateName && !isNaN(regularPrice) && regularPrice > 0 && regularPrice < 10) {
        states[stateName] = regularPrice;
      }
    }
  });

  // Strategy 2: If no table found, look for elements with class patterns AAA commonly uses
  if (Object.keys(states).length === 0) {
    // Look for state names paired with price values
    $('[class*="state"], [class*="State"]').each((i, el) => {
      const name = $(el).text().trim();
      const priceEl = $(el).next('[class*="price"], [class*="numb"], [class*="regular"]');
      if (priceEl.length) {
        const price = parseFloat(priceEl.text().trim().replace('$', ''));
        if (name && !isNaN(price) && price > 0 && price < 10) {
          states[name] = price;
        }
      }
    });
  }

  // Strategy 3: Look for .numb class (historically used by AAA)
  if (Object.keys(states).length === 0) {
    const prices = [];
    $('.numb').each((i, el) => {
      const val = parseFloat($(el).text().trim().replace('$', ''));
      if (!isNaN(val) && val > 0 && val < 10) {
        prices.push(val);
      }
    });
    // Try to pair with state names from nearby elements
    const stateNames = [];
    $('a[href*="state"], td:first-child, .state-name').each((i, el) => {
      const text = $(el).text().trim();
      if (STATE_TO_PADD[text]) {
        stateNames.push(text);
      }
    });
    stateNames.forEach((name, idx) => {
      if (prices[idx] !== undefined) {
        states[name] = prices[idx];
      }
    });
  }

  // Try to find national average
  const nationalText = $('body').text();
  const natMatch = nationalText.match(/national\s+average[^$]*\$?([\d.]+)/i);
  if (natMatch) {
    nationalAvg = parseFloat(natMatch[1]);
    if (isNaN(nationalAvg) || nationalAvg <= 0 || nationalAvg >= 10) {
      nationalAvg = null;
    }
  }

  // If we got state data, compute national average from states if not found directly
  if (!nationalAvg && Object.keys(states).length > 0) {
    const prices = Object.values(states);
    nationalAvg = prices.reduce((a, b) => a + b, 0) / prices.length;
  }

  if (Object.keys(states).length === 0) {
    throw new Error('Could not parse any state prices from AAA page');
  }

  console.log(`Parsed ${Object.keys(states).length} state prices from AAA. National avg: $${nationalAvg?.toFixed(3)}`);

  return { states, nationalAvg };
}

// --- EIA API (fallback for current prices, source of baselines) ---

async function fetchEIAPrices() {
  if (!EIA_API_KEY) {
    throw new Error('EIA_API_KEY not set');
  }

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

// --- Build JSON output ---

function buildJSON(nationalPrice, statePrices, eiaPrices, dataDate, dataSource) {
  const regions = REGIONS.map(region => {
    // Use EIA current regional price if available, otherwise average state prices in this PADD
    let regionCurrent = eiaPrices ? eiaPrices[region.id] : null;
    if (!regionCurrent && statePrices) {
      const stateEntries = Object.entries(statePrices).filter(([name]) => STATE_TO_PADD[name] === region.id);
      if (stateEntries.length > 0) {
        regionCurrent = stateEntries.reduce((sum, [, p]) => sum + p, 0) / stateEntries.length;
      }
    }

    return {
      name: region.name,
      id: region.id,
      current: regionCurrent ? Math.round(regionCurrent * 1000) / 1000 : null,
      inauguration: INAUGURATION_BASELINES[region.id],
      iranWar: IRAN_WAR_BASELINES[region.id]
    };
  });

  // Build states array with PADD-based baselines
  const states = [];
  if (statePrices) {
    for (const [name, price] of Object.entries(statePrices).sort((a, b) => a[0].localeCompare(b[0]))) {
      const padd = STATE_TO_PADD[name];
      if (padd) {
        states.push({
          name,
          current: Math.round(price * 1000) / 1000,
          padd,
          inauguration: INAUGURATION_BASELINES[padd],
          iranWar: IRAN_WAR_BASELINES[padd]
        });
      }
    }
  }

  return {
    lastUpdated: new Date().toISOString(),
    dataDate: dataDate,
    dataSource: dataSource,
    national: {
      current: Math.round(nationalPrice * 1000) / 1000,
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
    regions,
    states
  };
}

// --- Main update logic ---

async function updatePrices() {
  console.log(`[${new Date().toISOString()}] Fetching gas prices...`);

  let aaaPrices = null;
  let eiaPrices = null;
  let eiaDataDate = null;

  // Try AAA first (daily data, state-level)
  try {
    aaaPrices = await fetchAAAPrices();
  } catch (err) {
    console.warn(`AAA fetch failed: ${err.message}. Will fall back to EIA.`);
  }

  // Always try EIA too (for regional prices and as fallback)
  try {
    const eiaResult = await fetchEIAPrices();
    eiaPrices = eiaResult.prices;
    eiaDataDate = eiaResult.eiaDataDate;
  } catch (err) {
    console.warn(`EIA fetch failed: ${err.message}`);
  }

  // Determine which source to use for national price
  let nationalPrice, dataDate, dataSource;

  if (aaaPrices && aaaPrices.nationalAvg) {
    nationalPrice = aaaPrices.nationalAvg;
    dataDate = new Date().toISOString().split('T')[0]; // AAA is daily
    dataSource = 'AAA';
    console.log(`Using AAA data: national avg $${nationalPrice.toFixed(3)}`);
  } else if (eiaPrices && eiaPrices.NUS) {
    nationalPrice = eiaPrices.NUS;
    dataDate = eiaDataDate;
    dataSource = 'EIA';
    console.log(`Using EIA fallback: national avg $${nationalPrice.toFixed(3)}`);
  } else {
    console.error('Both AAA and EIA fetches failed.');
    if (fs.existsSync(DATA_FILE)) {
      console.log('Keeping previous data file.');
    }
    throw new Error('No price data available from any source');
  }

  const json = buildJSON(
    nationalPrice,
    aaaPrices ? aaaPrices.states : null,
    eiaPrices,
    dataDate,
    dataSource
  );

  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(json, null, 2));

  console.log(`[${new Date().toISOString()}] Gas prices updated (${dataSource}). ${json.states.length} states, ${json.regions.length} regions.`);
  return json;
}

// Allow running directly
if (require.main === module) {
  updatePrices().catch(() => process.exit(1));
}

module.exports = { updatePrices };

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'GeoLite2-City.mmdb');
const DB_MAX_AGE_DAYS = 30;

let lookup = null;

// Bounded LRU cache — Map preserves insertion order, so oldest key is first
const cache = new Map();
const CACHE_MAX = 10000;

function cacheGet(ip) {
  if (!cache.has(ip)) return undefined;
  const val = cache.get(ip);
  cache.delete(ip);
  cache.set(ip, val);
  return val;
}

function cacheSet(ip, region) {
  if (cache.size >= CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(ip, region);
}

function isDatabaseStale() {
  try {
    const stat = fs.statSync(DB_PATH);
    const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    return ageDays > DB_MAX_AGE_DAYS;
  } catch {
    return true;
  }
}

async function downloadDatabase(licenseKey) {
  const url = `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${licenseKey}&suffix=tar.gz`;
  const tmpFile = path.join(DB_DIR, 'GeoLite2-City.tar.gz');
  const tmpDir = path.join(DB_DIR, 'tmp_extract');

  fs.mkdirSync(DB_DIR, { recursive: true });

  console.log('Downloading MaxMind GeoLite2-City database...');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MaxMind download returned ${response.status}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(tmpFile, Buffer.from(buffer));

  fs.mkdirSync(tmpDir, { recursive: true });
  execSync(`tar xzf "${tmpFile}" -C "${tmpDir}"`);
  fs.unlinkSync(tmpFile);

  // Find the extracted .mmdb file (lives inside a dated subdirectory)
  let mmdbSrc = null;
  for (const entry of fs.readdirSync(tmpDir)) {
    const subdir = path.join(tmpDir, entry);
    if (fs.statSync(subdir).isDirectory()) {
      for (const file of fs.readdirSync(subdir)) {
        if (file.endsWith('.mmdb')) {
          mmdbSrc = path.join(subdir, file);
          break;
        }
      }
    }
    if (mmdbSrc) break;
  }

  if (!mmdbSrc) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error('No .mmdb file found in MaxMind archive');
  }

  fs.copyFileSync(mmdbSrc, DB_PATH);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('MaxMind GeoLite2-City database extracted to', DB_PATH);
}

async function initDatabase() {
  const licenseKey = process.env.MAXMIND_LICENSE_KEY;

  if (isDatabaseStale()) {
    if (licenseKey) {
      try {
        await downloadDatabase(licenseKey);
      } catch (err) {
        console.warn(`MaxMind database download failed: ${err.message}`);
        if (!fs.existsSync(DB_PATH)) {
          console.log('No local database available. Geo lookup will use ipwho.is fallback.');
          return;
        }
        console.log('Proceeding with existing (stale) database.');
      }
    } else if (!fs.existsSync(DB_PATH)) {
      console.log('MAXMIND_LICENSE_KEY not set and no local database found. Geo lookup will use ipwho.is fallback.');
      return;
    }
  }

  try {
    const maxmind = require('maxmind');
    lookup = await maxmind.open(DB_PATH);
    console.log('MaxMind GeoLite2 database loaded successfully.');
  } catch (err) {
    console.warn(`Failed to load MaxMind database: ${err.message}. Geo lookup will use ipwho.is fallback.`);
  }
}

function lookupStateFromDB(ip) {
  if (!lookup) return null;
  try {
    const result = lookup.get(ip);
    return result?.subdivisions?.[0]?.names?.en || null;
  } catch {
    return null;
  }
}

async function lookupState(ip) {
  const cached = cacheGet(ip);
  if (cached !== undefined) return cached;

  // Try local MaxMind database first (no external call, no rate limits)
  let state = lookupStateFromDB(ip);

  // Fall back to ipwho.is if database isn't loaded
  if (state === null && !lookup) {
    try {
      const res = await fetch(`http://ipwho.is/${ip}`);
      if (res.ok) {
        const geo = await res.json();
        state = geo.region || null;
      }
    } catch {
      state = null;
    }
  }

  cacheSet(ip, state);
  return state;
}

module.exports = { initDatabase, lookupState };

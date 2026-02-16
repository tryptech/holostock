/**
 * Hotyon shop: fetch full catalog and/or report which items are in stock.
 *
 * Usage (run from repo root):
 *   node scripts/fetch-full-catalog.js [output.json]     Fetch from API, save catalog, then run stock report.
 *   node scripts/fetch-full-catalog.js --from-file <path> [--report-only]
 *     Load catalog from file and run stock report. Use --report-only to skip writing any JSON.
 *
 * Default output (when not --from-file and not --report-only): data/catalog.json
 * Also writes: data/catalog-in-stock.json, data/catalog-out-of-stock.json
 *
 * Stock logic (from variant.available):
 *   - available > 0        → in stock (has quantity)
 *   - available === 0      → out of stock
 *   - available === -2147483648 (INT_MIN) → treated as orderable (unlimited/preorder)
 *
 * Optional env: API_KEY
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://svc-3-usf.hotyon.com/search';
const DEFAULT_API_KEY = 'f3982e4c-9b6a-407a-b368-0fcd0b21961b';
const COLLECTION = '432790438108';
const TAKE = 100; // page size (fewer requests; API may cap at its max)
const UNLIMITED_SENTINEL = -2147483648; // variant.available when stock not tracked / preorder

const apiKey = process.env.API_KEY || DEFAULT_API_KEY;

// Parse args
const args = process.argv.slice(2);
const fromFileIdx = args.indexOf('--from-file');
const reportOnly = args.includes('--report-only');
const fromFilePath = fromFileIdx >= 0 ? args[fromFileIdx + 1] : null;
const defaultOutput = path.join(process.cwd(), 'data', 'catalog.json');
const outputPath = reportOnly ? null : (args.find((a) => a.endsWith('.json') && a !== '--from-file') || (fromFilePath ? null : defaultOutput));

function buildUrl(skip) {
  const params = new URLSearchParams({
    q: '',
    apiKey: apiKey,
    country: 'US',
    locale: 'en',
    getProductDescription: '0',
    collection: COLLECTION,
    skip: String(skip),
    take: String(TAKE),
    sort: '-date',
  });
  return `${BASE_URL}?${params}`;
}

/** Returns true if this variant is considered orderable (in stock or unlimited/preorder). */
function isVariantInStock(variant) {
  const a = variant?.available;
  if (a == null) return false;
  if (a === UNLIMITED_SENTINEL) return true;  // unlimited / preorder
  return a > 0;
}

/** Classify items into in-stock vs out-of-stock. */
function analyzeStock(items) {
  const inStock = [];
  const outOfStock = [];
  for (const item of items) {
    const variants = item?.variants || [];
    const anyOrderable = variants.some(isVariantInStock);
    if (anyOrderable) {
      inStock.push(item);
    } else {
      outOfStock.push(item);
    }
  }
  return {
    inStock,
    outOfStock,
    total: items.length,
    inStockCount: inStock.length,
    outOfStockCount: outOfStock.length,
  };
}

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  if (dir) fs.mkdirSync(dir, { recursive: true });
}

function printStockReport(stats, options = {}) {
  const { inStock, outOfStock } = stats;
  console.log('\n--- Stock report ---');
  console.log('  In stock (orderable):', stats.inStockCount);
  console.log('  Out of stock:        ', stats.outOfStockCount);
  console.log('  Total products:      ', stats.total);
  if (options.writeInStockPath && inStock.length) {
    ensureDirFor(options.writeInStockPath);
    const payload = { data: { total: inStock.length, items: inStock } };
    fs.writeFileSync(options.writeInStockPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log('\n  In-stock list written to:', options.writeInStockPath);
  }
  if (options.writeOutOfStockPath && outOfStock.length) {
    ensureDirFor(options.writeOutOfStockPath);
    const payload = { data: { total: outOfStock.length, items: outOfStock } };
    fs.writeFileSync(options.writeOutOfStockPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log('  Out-of-stock list written to:', options.writeOutOfStockPath);
  }
}

async function fetchPage(skip) {
  const url = buildUrl(skip);
  const res = await fetch(url, {
    headers: { 'accept-language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function main() {
  let allItems = [];
  let catalogPath = outputPath;

  if (fromFilePath) {
    console.log('Loading catalog from', fromFilePath, '...');
    const raw = fs.readFileSync(fromFilePath, 'utf8');
    const json = JSON.parse(raw);
    allItems = json?.data?.items;
    if (!Array.isArray(allItems)) {
      console.error('Expected data.items array in file.');
      process.exit(1);
    }
    console.log('  Loaded', allItems.length, 'items.\n');
  } else {
    console.log('Fetching full catalog (collection', COLLECTION + ')...\n');
    let template = null;
    let skip = 0;
    let totalExpected = null;

    while (true) {
      process.stdout.write(`  skip=${skip} ... `);
      const json = await fetchPage(skip);
      const data = json?.data;
      const items = data?.items;

      if (!Array.isArray(items)) {
        console.error('\nUnexpected response structure.');
        process.exit(1);
      }

      if (!template) {
        template = { ...json, data: { ...data, items: [] } };
        totalExpected = data.total;
        console.log('total declared:', totalExpected);
      } else {
        console.log('got', items.length);
      }

      allItems.push(...items);
      if (items.length < TAKE) break;
      skip += TAKE;
      if (totalExpected != null && allItems.length >= totalExpected) break;
    }

    if (!reportOnly && outputPath) {
      ensureDirFor(outputPath);
      template.data.items = allItems;
      template.data.total = allItems.length;
      fs.writeFileSync(outputPath, JSON.stringify(template, null, 4), 'utf8');
      console.log('\n  Written:', outputPath);
    }
  }

  const stats = analyzeStock(allItems);
  const basePath = catalogPath ? catalogPath.replace(/\.json$/i, '') : fromFilePath?.replace(/\.json$/i, '') || path.join(process.cwd(), 'data', 'catalog');
  printStockReport(stats, {
    writeInStockPath: basePath + '-in-stock.json',
    writeOutOfStockPath: basePath + '-out-of-stock.json',
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

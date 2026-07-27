/**
 * Fetch full catalog from the official shop's public Shopify collection JSON,
 * normalize to the internal catalog shape, and report in-stock vs out-of-stock.
 *
 * Usage (run from repo root):
 *   node scripts/fetch-full-catalog.js [output.json]     Fetch, save catalog, then run stock report.
 *   node scripts/fetch-full-catalog.js --from-file <path> [--report-only]
 *     Load catalog from file and run stock report. Use --report-only to skip writing any JSON.
 *
 * Default output (when not --from-file and not --report-only): data/catalog.json
 * Also writes: data/catalog-in-stock.json, data/catalog-out-of-stock.json
 *
 * Stock logic (after normalize):
 *   - available === true           → in stock (qty unknown; Shopify public JSON is boolean-only)
 *   - available === 0 / false      → out of stock
 *   - available === -2147483648    → orderable unlimited (digital / untracked inventory)
 *
 * Source: https://shop.hololivepro.com/en/collections/all/products.json
 */

const fs = require('fs');
const path = require('path');

const PRODUCTS_JSON_BASE =
  'https://shop.hololivepro.com/en/collections/all/products.json';
const PAGE_LIMIT = 250; // Shopify max per page
const UNLIMITED_SENTINEL = -2147483648;
const USER_AGENT = 'holostock-catalog-fetch/1.0 (+https://github.com/tryptech/holostock)';
const FETCH_MAX_ATTEMPTS = 5;
const FETCH_RETRY_BASE_MS = 1000;
const FETCH_429_BASE_MS = 5000;
const PAGE_DELAY_MS = 1500; // pause between pages to reduce 429s

// Parse args
const args = process.argv.slice(2);
const fromFileIdx = args.indexOf('--from-file');
const reportOnly = args.includes('--report-only');
const fromFilePath = fromFileIdx >= 0 ? args[fromFileIdx + 1] : null;
const defaultOutput = path.join(process.cwd(), 'data', 'catalog.json');
const outputPath = reportOnly
  ? null
  : args.find((a) => a.endsWith('.json') && a !== fromFilePath) ||
    (fromFilePath ? null : defaultOutput);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns true if this variant is considered orderable. */
function isVariantInStock(variant) {
  const a = variant?.available;
  if (a == null || a === false) return false;
  if (a === true) return true;
  if (a === UNLIMITED_SENTINEL) return true;
  return typeof a === 'number' && a > 0;
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

/**
 * Map Shopify option1/option2/option3 onto option value indices
 * (same shape Hotyon used: variant.options = [i0, i1, ...]).
 */
function optionIndices(product, variant) {
  const opts = product.options || [];
  const chosen = [variant.option1, variant.option2, variant.option3];
  return opts.map((opt, i) => {
    const values = opt?.values || [];
    const val = chosen[i];
    if (val == null) return 0;
    const idx = values.indexOf(val);
    return idx >= 0 ? idx : 0;
  });
}

function imageIndexForVariant(product, variant) {
  const images = product.images || [];
  if (!images.length) return 0;
  const featuredId = variant.featured_image?.id;
  if (featuredId != null) {
    const byId = images.findIndex((img) => img.id === featuredId);
    if (byId >= 0) return byId;
  }
  const vid = variant.id;
  const byVariant = images.findIndex(
    (img) => Array.isArray(img.variant_ids) && img.variant_ids.includes(vid)
  );
  return byVariant >= 0 ? byVariant : 0;
}

/**
 * Normalize a Shopify products.json product into the internal catalog item shape
 * expected by build-in-stock-table.js.
 */
function normalizeShopifyProduct(product) {
  const images = (product.images || []).map((img) => ({
    url: img.src,
    alt: img.alt ?? null,
    width: img.width,
    height: img.height,
  }));

  const options = (product.options || []).map((opt) => ({
    name: opt.name,
    values: opt.values || [],
  }));

  const variants = (product.variants || []).map((v) => {
    const priceNum = parseFloat(v.price);
    let available;
    if (v.available === true) {
      // Public JSON has no qty. Digital / unshipped → unlimited; else boolean in-stock.
      available = v.requires_shipping === false ? UNLIMITED_SENTINEL : true;
    } else {
      available = 0;
    }
    return {
      id: v.id,
      sku: v.sku || null,
      available,
      price: Number.isFinite(priceNum) ? priceNum : 0,
      weight: v.grams != null ? v.grams : null,
      compareAtPrice: v.compare_at_price != null ? parseFloat(v.compare_at_price) : null,
      imageIndex: imageIndexForVariant(product, v),
      options: optionIndices(product, v),
      // Keep Shopify option strings for build fallbacks
      option1: v.option1,
      option2: v.option2,
      option3: v.option3,
      requires_shipping: v.requires_shipping,
    };
  });

  return {
    id: product.id,
    title: product.title,
    urlName: product.handle,
    vendor: product.vendor || '',
    tags: Array.isArray(product.tags) ? product.tags : [],
    date: product.published_at || product.created_at || null,
    createdAt: product.created_at || null,
    updatedAt: product.updated_at || null,
    options,
    images,
    variants,
    source: 'shopify-products-json',
  };
}

function retryDelayMs(status, attempt, retryAfterHeader) {
  if (retryAfterHeader) {
    const asSeconds = Number(retryAfterHeader);
    if (Number.isFinite(asSeconds) && asSeconds >= 0) {
      return Math.max(1000, Math.ceil(asSeconds * 1000));
    }
    const asDate = Date.parse(retryAfterHeader);
    if (!Number.isNaN(asDate)) {
      return Math.max(1000, asDate - Date.now());
    }
  }
  const base = status === 429 ? FETCH_429_BASE_MS : FETCH_RETRY_BASE_MS;
  return base * Math.pow(2, attempt - 1);
}

/** Retry transient Shopify failures (429, 5xx, network). */
async function fetchShopifyPage(page) {
  const url = `${PRODUCTS_JSON_BASE}?limit=${PAGE_LIMIT}&page=${page}`;
  let lastErr;
  let lastStatus = null;
  let lastRetryAfter = null;

  for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': USER_AGENT,
        },
      });

      if (res.ok) return res.json();

      lastStatus = res.status;
      lastRetryAfter = res.headers.get('retry-after');
      lastErr = new Error(`HTTP ${res.status}: ${url}`);
      const isRetryable = res.status === 429 || (res.status >= 500 && res.status <= 599);
      if (!isRetryable) throw lastErr;
    } catch (err) {
      // Non-retryable HTTP (other 4xx) — fail immediately
      if (err && err.message && /^HTTP 4\d\d:/.test(err.message) && !/^HTTP 429:/.test(err.message)) {
        throw err;
      }
      lastErr = err;
      if (!(err && err.message && /^HTTP (429|5\d\d):/.test(err.message))) {
        lastStatus = null;
        lastRetryAfter = null;
      }
    }

    if (attempt === FETCH_MAX_ATTEMPTS) break;

    const delay = retryDelayMs(lastStatus, attempt, lastRetryAfter);
    const reason = lastStatus != null ? String(lastStatus) : 'network error';
    process.stdout.write(`${reason}, retry ${attempt}/${FETCH_MAX_ATTEMPTS} in ${delay}ms ... `);
    await sleep(delay);
  }

  throw lastErr || new Error(`Failed to fetch ${url}`);
}

async function fetchAllShopifyProducts() {
  const all = [];
  let page = 1;
  while (true) {
    if (page > 1) await sleep(PAGE_DELAY_MS);
    process.stdout.write(`  page=${page} ... `);
    const json = await fetchShopifyPage(page);
    const products = json?.products;
    if (!Array.isArray(products)) {
      throw new Error('Unexpected response: expected products array');
    }
    console.log('got', products.length);
    if (products.length === 0) break;
    all.push(...products.map(normalizeShopifyProduct));
    if (products.length < PAGE_LIMIT) break;
    page += 1;
  }
  return all;
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
    console.log('Fetching full catalog from Shopify products.json...\n');
    allItems = await fetchAllShopifyProducts();

    if (!reportOnly && outputPath) {
      ensureDirFor(outputPath);
      const payload = {
        source: 'shopify-products-json',
        fetchedAt: new Date().toISOString(),
        data: { total: allItems.length, items: allItems },
      };
      fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
      console.log('\n  Written:', outputPath);
    }
  }

  const stats = analyzeStock(allItems);
  const basePath = catalogPath
    ? catalogPath.replace(/\.json$/i, '')
    : fromFilePath?.replace(/\.json$/i, '') || path.join(process.cwd(), 'data', 'catalog');
  printStockReport(stats, {
    writeInStockPath: basePath + '-in-stock.json',
    writeOutOfStockPath: basePath + '-out-of-stock.json',
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

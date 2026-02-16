/**
 * Build a table of in-stock items with title, price, product link, and info endpoint link.
 *
 * Usage (run from repo root):
 *   node scripts/build-in-stock-table.js [in-stock.json]           Output Markdown + HTML table.
 *   node scripts/build-in-stock-table.js --physical-only            Keep only physical products (info API returns []).
 *   node scripts/build-in-stock-table.js --output-json <path>       Also write { items } JSON for the SPA (e.g. site/data/items.json).
 *
 * Default input: data/catalog-in-stock.json
 * Output: in-stock-table.md, in-stock-table.html (next to the input file or in data/).
 */

const fs = require('fs');
const path = require('path');

const PRODUCT_BASE = 'https://shop.hololivepro.com/en/products/';
const INFO_BASE = 'https://d2z3u0bdyw6j8v.cloudfront.net/info';
const UNLIMITED_SENTINEL = -2147483648;

const defaultInputPath = path.join(process.cwd(), 'data', 'catalog-in-stock.json');

function isVariantInStock(v) {
  const a = v?.available;
  if (a == null) return false;
  return a === UNLIMITED_SENTINEL || a > 0;
}

function getPriceRange(item) {
  const variants = item?.variants || [];
  const inStock = variants.filter(isVariantInStock);
  if (!inStock.length) return { min: null, max: null, single: null };
  const prices = inStock.map((v) => v.price).filter((p) => p != null);
  if (!prices.length) return { min: null, max: null, single: null };
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, single: min === max ? min : null };
}

/** Keep only items that have at least one in-stock variant with price > 0. (No weight filter; digital/voice variants included.) */
function filterPaid(items) {
  return items.filter((item) => {
    const inStock = (item?.variants || []).filter(isVariantInStock);
    return inStock.some((v) => (v?.price ?? 0) > 0);
  });
}

function formatPrice(price) {
  if (price == null) return '—';
  return '$' + Number(price).toLocaleString();
}

/** Get display label for a variant from product options (e.g. "Birthday Set" or "セット / グッズ"). */
function getVariantLabel(product, variant) {
  const opts = product?.options || [];
  const indices = variant?.options;
  if (!Array.isArray(indices) || indices.length === 0) return '—';
  const parts = opts
    .slice(0, indices.length)
    .map((opt, i) => opt?.values?.[indices[i]])
    .filter(Boolean);
  return parts.length ? parts.join(' / ') : '—';
}

/** If talent string has both English and Japanese (e.g. "English（日本語）" or "English / 日本語"), return only the first/English part. */
function talentEnglishOnly(s) {
  if (!s || typeof s !== 'string') return s;
  const t = s.trim();
  for (const sep of [' / ', '／', '（', ' (']) {
    const i = t.indexOf(sep);
    if (i > 0) return t.slice(0, i).trim();
  }
  return t;
}

/** Map Japanese talent names (from Talent_ tags) to English so they merge with vendor spelling in the filter. */
const TALENT_JP_TO_EN = {
  '星街すいせい': 'Hoshimachi Suisei',
  '博衣こより': 'Hakui Koyori',
  'ラプラス・ダークネス': 'La+ Darknesss',
  '不知火フレア': 'Shiranui Flare',
  '癒月ちょこ': 'Yuzuki Choco',
  'ジュラルド・ティー・レクスフォード': 'Jurard T Rexford',
  '虎金妃笑虎': 'Koganei Niko',
  '輪堂千速': 'Rindo Chihaya',
  'ラオーラ・パンテーラ': 'Raora Panthera',
  '姫森ルーナ': 'Himemori Luna',
  '水宮枢': 'Mizumiya Su',
  '尾丸ポルカ': 'Omaru Polka',
  '鷹嶺ルイ': 'Takane Lui',
  '風真いろは': 'Hiodoshi Ao',
  '儒烏風亭らでん': 'Juufuutei Raden',
  '百鬼あやめ': 'Nakiri Ayame',
  '雪花ラミィ': 'Yukihana Lamy',
  'エリザベス・ローズ・ブラッドフレイム': 'Elizabeth Rose Bloodflame',
  'アーニャ・メルフィッサ': 'Anya Melfissa',
  'アキ・ローゼンタール': 'Aki Rosenthal',
  'アステル・レダ': 'Astel Leda',
  'アユンダ・リス': 'Ayunda Risu',
  'がうる・ぐら': 'Gawr Gura',
  'こぼ・かなえる': 'Kobo Kanaeru',
  'さくらみこ': 'Sakura Miko',
  'ときのそら': 'Tokino Sora',
  'フワワ・アビスガード': 'Fuwawa Abyssgard',
  'ワトソン・アメリア': 'Watson Amelia',
  '兎田ぺこら': 'Usada Pekora',
  '夏色まつり': 'Natsuiro Matsuri',
  '大神ミオ': 'Ookami Mio',
  '大空スバル': 'Oozora Subaru',
  '天音かなた': 'Amane Kanata',
  '宝鐘マリン': 'Houshou Marine',
  '春先のどか': 'Harusaki Nodoka',
  '獅白ぼたん': 'Shishiro Botan',
  '白上フブキ': 'Shirakami Fubuki',
  '綺々羅々ヴィヴィ': 'Kikirara Vivi',

};

/** Talent from product: prefer vendor (English) when not generic; else Talent_* tag. Normalize JP to EN via map; strip "both" format. */
function getTalent(product) {
  const v = (product?.vendor || '').trim();
  const generic = /hololive production official shop/i.test(v) || v === '';
  let raw = '';
  if (v && !generic) {
    raw = talentEnglishOnly(v);
  } else {
    const tags = product?.tags || [];
    const talentTag = tags.find((t) => String(t).startsWith('Talent_'));
    raw = talentTag ? String(talentTag).replace(/^Talent_/, '').trim() : v;
    raw = talentEnglishOnly(raw || '');
  }
  if (!raw) return '—';
  return TALENT_JP_TO_EN[raw] || raw;
}

/** Item type from first option value (e.g. グッズ, セット). */
function getItemType(product, variant) {
  const opts = product?.options || [];
  const indices = variant?.options;
  if (!Array.isArray(indices) || indices.length === 0) return '—';
  const firstOpt = opts[0];
  const idx = indices[0];
  const val = firstOpt?.values?.[idx];
  return val != null ? String(val) : '—';
}

/** True when this variant is digital: voice, download, ASMR, digital contents, etc. Uses item type and display label. */
function isVariantDigital(itemType, variantLabel) {
  if (itemType === 'ボイス') return true;
  const label = (variantLabel || '').toLowerCase();
  if (/digital\s+contents|^download\s*\/|^ダウンロード\s*\//.test(label)) return true;
  if (/\bvoice\b|ボイス|asmr|system voice|situation voice|voice set/.test(label)) return true;
  return false;
}

/** True if product is preorder / made-to-order (tags). */
function isPreorder(product) {
  const tags = product?.tags || [];
  return tags.some((t) => /受注生産|先行発送/i.test(String(t)));
}

/** Format product date for display (YYYY-MM-DD). */
function formatDate(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return null;
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** One row per in-stock variant with price > 0. (Weight 0 allowed so digital/voice variants are included.) */
function buildVariantRows(product) {
  const title = product?.title || '—';
  const urlName = product?.urlName || '';
  const productUrl = urlName ? PRODUCT_BASE + encodeURIComponent(urlName) : '';
  const talent = getTalent(product);
  const rawDate = product?.date || null;
  const date = rawDate ? formatDate(rawDate) : null;
  const preorder = isPreorder(product);
  const variants = (product?.variants || []).filter(isVariantInStock);
  const rows = [];
  for (const v of variants) {
    if ((v?.price ?? 0) <= 0) continue;
    const itemTypeVal = getItemType(product, v);
    const variantLabel = getVariantLabel(product, v);
    rows.push({
      title,
      item: variantLabel,
      price: formatPrice(v.price),
      productUrl: productUrl || undefined,
      talent,
      itemType: itemTypeVal,
      date: date || undefined,
      dateRaw: rawDate || undefined,
      isDigital: isVariantDigital(itemTypeVal, variantLabel),
      isPreorder: preorder,
    });
  }
  return rows;
}

/** Returns true if the info endpoint returns [] (physical product only). */
async function isPhysicalOnly(productId, variantId) {
  try {
    const res = await fetch(`${INFO_BASE}?productId=${productId}&variantId=${variantId}`);
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data) && data.length === 0;
  } catch {
    return false;
  }
}

async function fetchInfo(productId, variantId) {
  const url = `${INFO_BASE}?productId=${productId}&variantId=${variantId}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data[0]) {
      const d = data[0];
      const parts = [];
      if (d.duration != null) parts.push(`${Math.round(d.duration)}s`);
      if (d.format_name) parts.push(d.format_name);
      if (d.filesize != null) parts.push(`${(d.filesize / 1024 / 1024).toFixed(2)} MB`);
      return parts.length ? parts.join(', ') : JSON.stringify(d).slice(0, 60);
    }
    return Array.isArray(data) && data.length === 0 ? '(no files)' : JSON.stringify(data).slice(0, 80);
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toMarkdown(rows) {
  const header = '| Title | Item | Price |';
  const sep = '| --- | --- | --- |';
  const body = rows
    .map((r) => {
      const t = (r.title || '—').replace(/\|/g, '\\|');
      const i = (r.item || '—').replace(/\|/g, '\\|');
      return `| ${t} | ${i} | ${r.price} |`;
    })
    .join('\n');
  return header + '\n' + sep + '\n' + body + '\n';
}

function toHtml(rows) {
  const thead =
    '<thead><tr><th>Title</th><th>Item</th><th>Price</th></tr></thead>';
  const tbody =
    '<tbody>\n' +
    rows
      .map((r) => {
        return `  <tr><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.item)}</td><td>${escapeHtml(r.price)}</td></tr>`;
      })
      .join('\n') +
    '\n</tbody>';
  return (
    '<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8"><title>In-stock items</title>\n' +
    '<style>table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f5f5f5}</style>\n</head>\n<body>\n' +
    '<table>\n' +
    thead +
    '\n' +
    tbody +
    '\n</table>\n</body>\n</html>'
  );
}

async function main() {
  const args = process.argv.slice(2);
  const physicalOnlyFlag = args.includes('--physical-only');
  const outputJsonIdx = args.indexOf('--output-json');
  const outputJsonPath = outputJsonIdx >= 0 ? args[outputJsonIdx + 1] : null;
  const inputPath =
    args.find((a) => a.endsWith('.json') && !a.startsWith('--') && a !== outputJsonPath) ||
    defaultInputPath;

  if (!fs.existsSync(inputPath)) {
    console.error('File not found:', inputPath);
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  let items = json?.data?.items;
  if (!Array.isArray(items)) {
    console.error('Expected data.items array.');
    process.exit(1);
  }

  let before = items.length;
  items = filterPaid(items);
  let removed = before - items.length;
  if (removed) console.log('Filtered out', removed, 'items (0 cost). Remaining:', items.length);

  if (physicalOnlyFlag) {
    console.log('Filtering to physical-only (info API returns [] for each product)...');
    const physical = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const vid = (item.variants || []).filter(isVariantInStock)[0]?.id;
      process.stdout.write(`  ${i + 1}/${items.length}\r`);
      if (item.id != null && vid != null && (await isPhysicalOnly(item.id, vid))) {
        physical.push(item);
      }
      if (i > 0 && i % 25 === 0) await new Promise((r) => setTimeout(r, 100));
    }
    console.log('');
    removed = items.length - physical.length;
    items = physical;
    console.log('Filtered out', removed, 'digital/hybrid products. Remaining (physical only):', items.length);
  }

  const baseOut = inputPath.replace(/\.json$/i, '').replace(/-in-stock$/, '') + '-in-stock-table';
  const outMd = baseOut + '.md';
  const outHtml = baseOut + '.html';

  const rows = items.flatMap((item) => buildVariantRows(item));
  console.log('Building table for', rows.length, 'rows (one per variant)...');

  const md = toMarkdown(rows);
  const html = toHtml(rows);

  fs.mkdirSync(path.dirname(outMd), { recursive: true });
  fs.writeFileSync(outMd, md, 'utf8');
  fs.writeFileSync(outHtml, html, 'utf8');

  console.log('Wrote:', outMd);
  console.log('Wrote:', outHtml);

  if (outputJsonPath) {
    const dir = path.dirname(outputJsonPath);
    fs.mkdirSync(dir, { recursive: true });
    const builtAt = process.env.BUILD_TIMESTAMP || new Date().toISOString();
    const payload = { items: rows, builtAt: builtAt };
    fs.writeFileSync(outputJsonPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log('Wrote:', outputJsonPath);
    const mapPath = path.join(dir, 'talent-jp-to-en.json');
    fs.writeFileSync(mapPath, JSON.stringify(TALENT_JP_TO_EN, null, 2), 'utf8');
    console.log('Wrote:', mapPath);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Build a table of in-stock items with title, price, product link, and info endpoint link.
 *
 * Usage (run from repo root):
 *   node scripts/build-in-stock-table.js [in-stock.json]           Output Markdown + HTML table.
 *   node scripts/build-in-stock-table.js --physical-only            Keep only physical products (info API returns []).
 *   node scripts/build-in-stock-table.js --output-json <path>       Also write { items } JSON for the SPA (e.g. data/items.json).
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
  // Gen 0
  'ときのそら': 'Tokino Sora',
  'ロボ子さん': 'Roboco',
  'さくらみこ': 'Sakura Miko',
  '星街すいせい': 'Hoshimachi Suisei',
  // AZKi has no JP variant in tags; vendor uses AZKi
  // Gen 1
  '白上フブキ': 'Shirakami Fubuki',
  '夏色まつり': 'Natsuiro Matsuri',
  'アキ・ローゼンタール': 'Aki Rosenthal',
  '赤井はあと': 'Akai Haato',
  // Gen 2
  '百鬼あやめ': 'Nakiri Ayame',
  '癒月ちょこ': 'Yuzuki Choco',
  '大空スバル': 'Oozora Subaru',
  // Gamers
  '大神ミオ': 'Ookami Mio',
  '猫又おかゆ': 'Nekomata Okayu',
  '戌神ころね': 'Inugami Korone',
  // Gen 3
  '兎田ぺこら': 'Usada Pekora',
  '不知火フレア': 'Shiranui Flare',
  '白銀ノエル': 'Shirogane Noel',
  '宝鐘マリン': 'Houshou Marine',
  // Gen 4
  '角巻わため': 'Tsunomaki Watame',
  '常闇トワ': 'Tokoyami Towa',
  '姫森ルーナ': 'Himemori Luna',
  // Gen 5
  '雪花ラミィ': 'Yukihana Lamy',
  '桃鈴ねね': 'Momosuzu Nene',
  '獅白ぼたん': 'Shishiro Botan',
  '尾丸ポルカ': 'Omaru Polka',
  // holoX / Gen 6
  'ラプラス・ダークネス': 'La+ Darknesss',
  '鷹嶺ルイ': 'Takane Lui',
  '博衣こより': 'Hakui Koyori',
  '沙花叉クロヱ': 'Sakamata Chloe',
  '風真いろは': 'Kazama Iroha',
  // ID Gen 1
  'アユンダ・リス': 'Ayunda Risu',
  'ムーナ・ホシノヴァ': 'Moona Hoshinova',
  'アイラニ・イオフィフティーン': 'Airani Iofifteen',
  // ID Gen 2
  'クレイジー・オリー': 'Kureiji Ollie',
  'アーニャ・メルフィッサ': 'Anya Melfissa',
  'パヴォリア・レイネ': 'Pavolia Reine',
  // ID Gen 3
  'ベスティア・ゼータ': 'Vestia Zeta',
  'カエラ・コヴァルスキア': 'Kaela Kovalskia',
  'こぼ・かなえる': 'Kobo Kanaeru',
  // EN Myth
  '森カリオペ': 'Mori Calliope',
  '小鳥遊キアラ': 'Takanashi Kiara',
  '一伊那尓栖': 'Ninomae Ina\'nis',
  'ワトソン・アメリア': 'Watson Amelia',
  'がうる・ぐら': 'Gawr Gura',
  // EN Promise / Council / Project HOPE
  'オーロ・クロニー': 'Ouro Kronii',
  'ハコス・ベールズ': 'Hakos Baelz',
  // EN Advent
  'シオリ・ノヴェラ': 'Shiori Novella',
  '古石ビジュー': 'Koseki Bijou',
  'ネリッサ・レイヴンクロフト': 'Nerissa Ravencroft',
  'フワワ・アビスガード': 'Fuwawa Abyssgard',
  'モココ・アビスガード': 'Mococo Abyssgard',
  // EN Justice
  'エリザベス・ローズ・ブラッドフレイム': 'Elizabeth Rose Bloodflame',
  'ジジ・ムリン': 'Gigi Murin',
  'セシリア・イマーグリーン': 'Cecilia Immergreen',
  'ラオーラ・パンテーラ': 'Raora Panthera',
  // ReGLOSS
  '音乃瀬奏': 'Otonose Kanade',
  '一条莉々華': 'Ichijou Ririka',
  '儒烏風亭らでん': 'Juufuutei Raden',
  '轟はじめ': 'Todoroki Hajime',
  // FLOW GLOW
  '響咲リオナ': 'Isaki Riona',
  '虎金妃笑虎': 'Koganei Niko',
  '水宮枢': 'Mizumiya Su',
  '輪堂千速': 'Rindo Chihaya',
  '綺々羅々ヴィヴィ': 'Kikirara Vivi',
  // HOLOSTARS 1st
  '花咲みやび': 'Hanasaki Miyabi',
  '奏手イヅル': 'Kanade Izuru',
  'アルランディス': 'Arurandeisu',
  'リッカロイド': 'Rikkaroid',
  // HOLOSTARS 2nd
  'アステル・レダ': 'Astel Leda',
  '岸堂テンマ': 'Kishido Temma',
  '夕刻ロベル': 'Yukoku Roberu',
  // HOLOSTARS 3rd
  '影山シエン': 'Kageyama Shien',
  '荒咬オウガ': 'Aragami Oga',
  // UPROAR!!
  '矢戸乃上フウマ': 'Yatogami Fuma',
  '宇佐美うゆ': 'Utsugi Uyu',
  '水無世燐央': 'Minase Rio',
  // Tempus
  'レギス・アルテア': 'Regis Altare',
  'アキロゼ': 'Axel Syrios',
  'ガヴィス・ベッテル': 'Gavis Bettel',
  'マキナ・X・フレオン': 'Machina X Flayon',
  '斑目ハッカ': 'Banzoin Hakka',
  '定利シュンリ': 'Josuiji Shinri',
  // Armis
  'ジュラルド・ティー・レクスフォード': 'Jurard T Rexford',
  'ゴールドブレット': 'Goldbullet',
  'オクタビオ': 'Octavio',
  'クリムゾン・ルーズ': 'Crimzon Ruze',
  // Alumni / graduates (may still appear in shop)
  '湊あくあ': 'Minato Aqua',
  '紫咲シオン': 'Murasaki Shion',
  '天音かなた': 'Amane Kanata',
  '桐生ココ': 'Kiryu Coco',
  'セレス・ファウナ': 'Ceres Fauna',
  '七詩ムメイ': 'Nanashi Mumei',
  '火威青': 'Hiodoshi Ao',
  '春先のどか': 'Harusaki Nodoka',
  '九十九佐命': 'Tsukumo Sana',
  'ヨゾラ・メル': 'Yozora Mel',
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

/** True if product has 先行発送 tag (preorder / advance shipping). */
function isPreorder(product) {
  const tags = product?.tags || [];
  return tags.some((t) => /先行発送/i.test(String(t)));
}

/** True if product has 受注生産 tag (made-to-order). */
function isMadeToOrder(product) {
  const tags = product?.tags || [];
  return tags.some((t) => /受注生産/i.test(String(t)));
}

/** True if this variant is an "old price" option (skip when same product has a current-price variant). */
function isOldPriceVariant(variantLabel) {
  if (!variantLabel || typeof variantLabel !== 'string') return false;
  const label = variantLabel.trim();
  return /old\s*price|旧価格/i.test(label);
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
  const madeToOrder = isMadeToOrder(product);
  const variants = (product?.variants || []).filter(isVariantInStock);
  const rows = [];
  for (const v of variants) {
    if ((v?.price ?? 0) <= 0) continue;
    const itemTypeVal = getItemType(product, v);
    const variantLabel = getVariantLabel(product, v);
    if (isOldPriceVariant(variantLabel)) continue;
    const rawStock = v?.available;
    const stockUnlimited = rawStock === UNLIMITED_SENTINEL;
    const stock = stockUnlimited ? null : (rawStock != null ? rawStock : null);
    const stockDisplay = stockUnlimited ? 'Unlimited' : (stock != null ? String(stock) : '—');
    const images = product?.images;
    const imageIndex = v?.imageIndex != null && Array.isArray(images) ? Math.min(v.imageIndex, images.length - 1) : 0;
    const imageObj = Array.isArray(images) && images[imageIndex] ? images[imageIndex] : images?.[0];
    let imageUrl = imageObj?.url;
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
    rows.push({
      title,
      item: variantLabel,
      price: formatPrice(v.price),
      stock,
      stockDisplay,
      imageUrl: imageUrl || undefined,
      productUrl: productUrl || undefined,
      talent,
      itemType: itemTypeVal,
      date: date || undefined,
      dateRaw: rawDate || undefined,
      isDigital: isVariantDigital(itemTypeVal, variantLabel),
      isPreorder: preorder,
      isMadeToOrder: madeToOrder,
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
    const searchTerms = buildTalentSearchTerms(rows);
    const searchTermsPath = path.join(dir, 'talent-search-terms.json');
    fs.writeFileSync(searchTermsPath, JSON.stringify(searchTerms, null, 2), 'utf8');
    console.log('Wrote:', searchTermsPath);
  }
}

/** Build { "Talent Name": ["Talent Name", "日本語"], ... } for filtering by item/title. */
function buildTalentSearchTerms(rows) {
  const enToJp = {};
  for (const [jp, en] of Object.entries(TALENT_JP_TO_EN)) {
    if (!enToJp[en]) enToJp[en] = [];
    enToJp[en].push(jp);
  }
  const terms = {};
  for (const [en, jpList] of Object.entries(enToJp)) {
    terms[en] = [en, ...jpList];
  }
  const talentsInData = new Set(rows.map((r) => r.talent).filter(Boolean));
  for (const t of talentsInData) {
    if (!terms[t]) terms[t] = [t];
  }
  return terms;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

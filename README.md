# holostock

Static SPA that lists in-stock items from the official shop.
**Live demo:** [tryp.tech/holostock/](https://tryp.tech/holostock/)

Filter by talent (with Japanese/English name matching in title and item), exclude digital items and preorders, sort by title/item/price/date. Data is built by a Node pipeline and updated automatically every hour via GitHub Actions.

## Features

- **Talent filter** – Dropdown of unique talents; selection matches both the row’s talent field and any occurrence of the talent name (EN or JP) in the title or item column.
- **Exclude digital** – When checked, hides rows marked digital in the data and any row whose title or item contains “voice” or ボイス (voice packs, voice archives, voice dramas, etc.).
- **Exclude preorder** – When checked, hides preorder/made-to-order items.
- **Sortable table** – Click column headers to sort by Title, Item, Price, or Date (default: date descending).
- **Last updated** – Displays the build timestamp from the last pipeline run.

## Repo structure

```
├── .github/workflows/
│   └── update-catalog.yml      # Fetches catalog, builds data, deploys via Pages artifact
├── scripts/
│   ├── fetch-full-catalog.js   # Paginate Hotyon API → data/catalog-in-stock.json
│   └── build-in-stock-table.js # Build variant rows, talent map, search terms
├── index.html
├── js/
│   └── app.js
├── data/
│   ├── items.json              # SPA table data (built by workflow, not committed)
│   ├── talent-jp-to-en.json    # JP → EN talent names (built by workflow)
│   └── talent-search-terms.json # Per-talent EN+JP terms for filter (built by workflow)
├── .gitignore
├── LICENSE
└── README.md
```

## Local setup

1. **Run from repo root.** Node 18+ required (uses native `fetch`).

2. **Fetch catalog and build SPA data:**
   ```bash
   node scripts/fetch-full-catalog.js
   node scripts/build-in-stock-table.js data/catalog-in-stock.json --output-json data/items.json
   ```
   This writes `data/items.json`, `data/talent-jp-to-en.json`, and `data/talent-search-terms.json`.

3. **Serve the app** (e.g. `npx serve` from repo root, or open with a static server). For production, the workflow deploys the site (including built data) via GitHub Pages.

**Optional:** `API_KEY=... node scripts/fetch-full-catalog.js` to override the API key. `--from-file <path>` loads an existing catalog instead of calling the API. `--physical-only` in the build script keeps only physical products (slower; calls info API per product).

## GitHub Actions

- **Workflow:** `.github/workflows/update-catalog.yml`
- **Triggers:** Push to `main`, `workflow_dispatch`, and every hour (`cron: '0 * * * *'`).
- **Steps:** Checkout → Node 20 → fetch full catalog → set build timestamp → build table with `--output-json data/items.json` → upload the repo root (with built `data/*.json`) as the Pages artifact → deploy to GitHub Pages. The built JSON files are not committed to the repo; they exist only in the deployment artifact that Pages serves.
- **Permissions:** `contents: read`, `pages: write` for the build job; `pages: write` for the deploy job.

No secrets required; the workflow uses the Hotyon API key in the script. To run manually: **Actions → Update catalog → Run workflow**.

## GitHub Pages

**Settings → Pages → Build and deployment:** **Source** → **GitHub Actions**. The workflow uploads the site (repo root plus built `data/items.json`, `data/talent-jp-to-en.json`, `data/talent-search-terms.json`) as the deployment artifact and deploys it. The SPA runs from the repo root; all asset paths are relative. No front-end build step.

**Important:** Only the **Update catalog** workflow should deploy to Pages. If you have a separate workflow named **pages build and deployment** (or similar) that also deploys to GitHub Pages, it will deploy the branch without the built JSON and overwrite this deployment, causing "Failed to load data: 404". Remove or disable that workflow (e.g. delete its file under `.github/workflows/` on the default branch) so that only **Update catalog** runs the deploy step.

## Pipeline details

- **fetch-full-catalog.js** – Paginates the Hotyon search API, writes full catalog and in-stock/out-of-stock JSON under `data/`.
- **build-in-stock-table.js** – Reads in-stock catalog, keeps paid variants, builds one row per variant with title, item, price, product URL, talent (using a built-in JP→EN map), item type, date, and `isDigital` / `isPreorder`. Writes `items.json` (with `builtAt`), `talent-jp-to-en.json`, and `talent-search-terms.json` (per-talent EN + JP strings for filtering by title/item). The JP→EN map in the script is a full list of talents (and selected alumni) so tags and vendor names normalize to a single English display name.

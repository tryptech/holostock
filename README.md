# hololive shop – In-stock items

Static SPA that lists in-stock items from the Hotyon hololive shop: filter by talent, exclude digital/preorder, sort by title/item/price/date. Data is built by a Node pipeline and can be updated automatically via GitHub Actions.

## Repo structure

```
├── .github/workflows/
│   └── update-catalog.yml   # Fetches catalog, builds data, commits updates
├── scripts/
│   ├── fetch-full-catalog.js    # Paginate API → data/catalog-in-stock.json
│   └── build-in-stock-table.js  # Build variant rows → data/items.json + talent map
├── index.html
├── js/
│   └── app.js
├── data/
│   ├── items.json           # SPA table data (committed)
│   ├── talent-jp-to-en.json # JP→EN talent names (committed)
│   ├── catalog.json         # Full catalog (gitignored)
│   ├── catalog-in-stock.json
│   └── catalog-out-of-stock.json
└── README.md
```

## Local setup

1. **Run from repo root.** Ensure Node 18+ (uses native `fetch`).

2. **Fetch catalog and build SPA data:**
   ```bash
   node scripts/fetch-full-catalog.js
   node scripts/build-in-stock-table.js data/catalog-in-stock.json --output-json data/items.json
   ```

3. **Serve the site** (e.g. open `index.html` with a local server, or use GitHub Pages).

Optional: override API key with `API_KEY=... node scripts/fetch-full-catalog.js`. Use `--from-file <path>` to load an existing catalog JSON instead of calling the API. Use `--physical-only` in the build script to keep only physical products (slower; calls info API per product).

## GitHub Actions

- **Workflow:** `.github/workflows/update-catalog.yml`
- **Triggers:** push to `main`, `workflow_dispatch`, and daily at 06:00 UTC.
- **Steps:** checkout → Node 20 → fetch full catalog → build table with `--output-json data/items.json` → commit and push `data/items.json` and `data/talent-jp-to-en.json` if changed (commit message includes `[skip ci]` to avoid re-triggering).
- **Permissions:** `contents: write` so the job can push the data commit.

To enable: push the repo to GitHub and ensure the default branch is `main` (or change `branches` in the workflow). No secrets required; the workflow uses the built-in Hotyon API key in the script. To run manually, use **Actions → Update catalog → Run workflow**.

## GitHub Pages

**Settings → Pages → Build and deployment**: Source = **GitHub Actions** (recommended), or **Deploy from a branch** with branch `main` and folder **/ (root)**. The app is at repo root (`index.html`, `js/`, `data/`), so the default branch root works as the site root.

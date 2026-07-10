# holostock

`holostock` is a small static web app for browsing in-stock merchandise.

Live site: [https://tryp.tech/holostock/](https://tryp.tech/holostock/)

## What it does

- Shows items in a table with name, talent, price, availability, and date.
- Supports search, talent filtering, and quick toggles to hide digital, preorder, or made-to-order items.
- Lets users sort by name, date, price, or availability.
- Displays the latest build timestamp in the UI.

## How it works

- `scripts/fetch-full-catalog.js` paginates the shop’s public Shopify `products.json` (collection `all`) and writes catalog snapshots under `data/`.
- `scripts/build-in-stock-table.js` converts that data into frontend JSON files in `data/`.
- `index.html` + `js/app.js` render the SPA from those generated files.
- `.github/workflows/update-catalog.yml` runs the update pipeline hourly and deploys to GitHub Pages.

Shopify’s public JSON only exposes boolean availability (not numeric stock). Rows show **In stock** or **Unlimited** (digital / untracked).

## Local usage

From the repo root (Node 18+):

```bash
node scripts/fetch-full-catalog.js
node scripts/build-in-stock-table.js data/catalog-in-stock.json --output-json data/items.json
```

Then serve the project with any static server (for example `npx serve .`) and open the local URL.

## Deployment

Deployment is handled by GitHub Actions via `.github/workflows/update-catalog.yml`.
The workflow updates data and publishes the site to GitHub Pages.

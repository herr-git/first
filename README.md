# Crypto and crypto fund dashboard (demo)

A read-only demo dashboard. Demo only. Not investment advice. No trading happens here.

## Status
- Crypto table: **live** data from CoinGecko, top 20 by 24-hour volume, refreshed about every 15 minutes.
- Fund table: **Sample data** (made up) until story V1-4.
- `preview.html`: Version 2 preview (pretend portfolio). All **Sample data**.
- Fund data check (V1-1): see `reports/fund-data-check.md`.

## Files
- `index.html`, `style.css`, `app.js`, `theme.js`: the dashboard page.
- `preview.html`, `preview.js`: the Version 2 preview page.
- `tests/test_portfolio.js`: known-answer test for the portfolio maths (`node tests/test_portfolio.js`).
- `data/latest.json`: prices, market value, volume, bid and ask, plus "last updated" per table.
- `data/funds-config.json`: the fund list, shares outstanding and yearly fee. Edit this to add or change funds.
- `data/settings.json`: refresh interval, the "data may be old" limit and how many tokens to fetch.
- `data/fetch-log.txt`: a line for each failed refresh.
- `scripts/fetch_crypto.py`: fetches CoinGecko data and writes `data/latest.json`.
- `.github/workflows/refresh-crypto.yml`: runs the script on a 15-minute timer (main branch only).
- `DATA_SOURCES.txt`: every data source and its terms.

## How to view
Open the GitHub Pages link. Opening `index.html` straight from your computer may show
"could not be loaded", because browsers block reading local data files.

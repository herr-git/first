# Crypto and crypto fund dashboard (demo)

A read-only demo dashboard. Demo only. Not investment advice. No trading happens here.

## Status
- Crypto table: **live** data from CoinGecko, top 20 by 24-hour volume, refreshed about every 15 minutes.
- Fund table: **live** data from Yahoo Finance (unofficial), refreshed every 15 minutes during US market hours.
- `preview.html`: Version 2 preview (pretend portfolio). Uses **real** 6-month daily prices from `data/history.json` once the daily job has run; exchange rates are still **Sample data**.
- Fund data check (V1-1): see `reports/fund-data-check.md`.
- Tokenized funds and European exchange-traded crypto products: **live**, CoinGecko and Yahoo, every 15 minutes. Product list in `data/tokenized-config.json`; job in `scripts/fetch_tokenized.py` and `.github/workflows/refresh-tokenized.yml`.

## Using the dashboard
- Search box: filters every table by name or ticker.
- Click Price, Market value or Volume headings to sort; click again to reverse.
- On a phone, tables scroll sideways; the name column stays in view.
- To refresh data by hand: GitHub, Actions tab, pick a job, Run workflow (branch main).

## Files
- `index.html`, `style.css`, `app.js`, `theme.js`: the dashboard page.
- `preview.html`, `preview.js`: the Version 2 preview page.
- `tests/test_portfolio.js`: known-answer test for the portfolio maths (`node tests/test_portfolio.js`).
- `data/latest.json`: live crypto data (written by the crypto job).
- `data/funds-latest.json`: live fund data (written by the fund job).
- `data/funds-config.json`: the fund list. Edit this to add or change funds.
- `scripts/fetch_funds.py` and `.github/workflows/refresh-funds.yml`: the fund job.
- `scripts/fetch_history.py` and `.github/workflows/refresh-history.yml`: the daily 6-month history job. Problems and missing days go to `data/history-log.txt`.
- `data/settings.json`: refresh interval, the "data may be old" limit and how many tokens to fetch.
- `data/fetch-log.txt` and `data/funds-fetch-log.txt`: a line for each failed crypto or fund refresh.
- `scripts/fetch_crypto.py`: fetches CoinGecko data and writes `data/latest.json`.
- `.github/workflows/refresh-crypto.yml`: runs the script on a 15-minute timer (main branch only).
- `DATA_SOURCES.txt`: every data source and its terms.

## How to view
Open the GitHub Pages link. Opening `index.html` straight from your computer may show
"could not be loaded", because browsers block reading local data files.

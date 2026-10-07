# V1-1 Fund data check: result

Test run: 7 Oct 2026, 19:14 UTC (US market open), on GitHub Actions.
Raw output: `reports/fund-data-raw.md`. Script: `scripts/fund_data_check.py`.

## 1. Can Google Finance be used? No.
Google closed its public Finance data service years ago, and its terms do not allow other apps to copy its data. (GUESS, high: the terms page could not be opened from the build session.)

## 2. What Yahoo Finance returned (via yfinance, unofficial)

| Fund | Price | Volume today | Bid / ask | Shares outstanding | Yearly fee | Total assets |
|---|---|---|---|---|---|---|
| IBIT | yes | yes | **looks wrong** | missing | 0.25% | yes |
| FBTC | yes | yes | yes | missing | 0.25% | yes |
| GBTC | yes | yes | yes | yes | 1.50% | yes |
| ETHA | yes | yes | **looks wrong** | missing | 0.25% | yes |
| ETHE | yes | yes | yes | missing | 2.50% | yes |
| ZCSH | yes | yes | yes | missing | 2.50% | yes |

What this means:
- **Price, volume and 5 days of history: available for all 6.** ZCSH works too. It now trades on NYSE Arca, a normal stock exchange.
- **Bid/ask: available for all 6, but 2 are not believable.**
  - IBIT: price $47.17, but bid/ask $36.71 / $36.73 (22% lower).
  - ETHA: price $57.89, but bid/ask $14.45 / $14.48 (75% lower).
  - Likely cause: Yahoo sent an old or mismatched quote. GUESS, medium.
  - Proposed rule: show bid/ask only when it is within 1% of the price, otherwise "not available".
- **Shares outstanding: only GBTC.** So "price times shares" cannot work for 5 of 6 funds.
- **Total assets: available for all 6.** This is the fund's own size, which is what "market value" of a fund normally means. Proposed: use it, labelled "Total assets (as reported by Yahoo; may lag by a few days)". No hand-typed numbers needed.
- **Yearly fee: available for all 6.** The values match the fund providers' usual published fees. GUESS, high. Proposed: use Yahoo's figure with the source shown, instead of typing it by hand.

## 3. Backup source
- **Stooq: failed for all 6** (error "404 Not Found"). Its free download link no longer works.
- Other free backups (Twelve Data, Finnhub, Alpha Vantage) each need a free sign-up key, stored as a GitHub secret. Not tested.
- Yahoo is unofficial and can break without warning. If it breaks, the fund table keeps its last good data and shows a clear warning, the same as the crypto table.

## 4. Can it work from a free static site?
Yes, using the same setup as the crypto table: a GitHub timed job fetches the data and saves a file, and the page only reads that file. Browsers cannot call Yahoo directly.

## 5. Recommendation
Use **Yahoo Finance via yfinance** for all 6 funds:
- Show price, volume, total assets (as market value) and yearly fee.
- Show bid/ask only when it is close to the price.
- Refresh during US market hours, and show the last close outside them.

Treat a backup source as optional. Add one only if the owner signs up for a free key.

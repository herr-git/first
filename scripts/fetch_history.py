"""Fetch about 6 months of daily prices for the current crypto tokens and the funds,
and save them into data/history.json for the pretend-portfolio page.

Runs once a day on GitHub Actions.
- Tokens: CoinGecko daily prices (one price per day, taken at 00:00 UTC).
- Funds: Yahoo Finance daily closing prices. Funds do not trade at weekends or
  on US holidays; on those days the last closing price is carried forward.
- If one asset fails, its previous history is kept and the problem is logged.
- Days that are still missing are written to data/history-log.txt.
"""

import json
import os
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "history.json")
LOG = os.path.join(ROOT, "data", "history-log.txt")
LATEST = os.path.join(ROOT, "data", "latest.json")
FUNDS = os.path.join(ROOT, "data", "funds-config.json")

DAYS = 182  # about 6 months, ending yesterday (UTC)
BASE = os.environ.get("COINGECKO_BASE", "https://api.coingecko.com/api/v3")
KEY = os.environ.get("COINGECKO_DEMO_KEY", "").strip()
PAUSE = float(os.environ.get("COINGECKO_PAUSE", "7"))  # seconds between calls, to stay inside the free limit


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def window():
    end = datetime.now(timezone.utc).date() - timedelta(days=1)
    return [end - timedelta(days=DAYS - 1 - i) for i in range(DAYS)]


def coingecko_daily(coin_id):
    headers = {"Accept": "application/json", "User-Agent": "crypto-dashboard-demo"}
    if KEY:
        headers["x-cg-demo-api-key"] = KEY
    url = f"{BASE}/coins/{coin_id}/market_chart?vs_currency=usd&days={DAYS + 5}&interval=daily"
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as res:
                data = json.load(res)
            out = {}
            for ms, price in data.get("prices", []):
                out[datetime.fromtimestamp(ms / 1000, timezone.utc).date().isoformat()] = price
            return out
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            time.sleep(60 if e.code == 429 else 10)  # 429 = free limit reached, wait a minute
        except Exception as e:
            last = f"{type(e).__name__}: {e}"
            time.sleep(10)
    raise RuntimeError(last)


def yahoo_closes(tickers):
    import yfinance as yf

    out = {}
    for t in tickers:
        try:
            h = yf.Ticker(t).history(period="7mo", interval="1d", auto_adjust=False)
            out[t] = {idx.date().isoformat(): float(row["Close"]) for idx, row in h.iterrows() if row["Close"] == row["Close"]}
        except Exception as e:
            out[t] = e
    return out


def align(daily, dates, carry_forward):
    """Put prices on the calendar. Funds carry the last close forward; tokens do not."""
    series, last = [], None
    earlier = sorted(d for d in daily if d < dates[0].isoformat())
    if carry_forward and earlier:
        last = daily[earlier[-1]]
    for d in dates:
        p = daily.get(d.isoformat())
        if p is None and carry_forward:
            p = last
        if p is not None:
            last = p
        series.append(round(p, 8) if p is not None else None)
    return series


def main():
    dates = window()
    old = {}
    if os.path.exists(OUT):
        with open(OUT) as f:
            old = json.load(f)
    old_assets = old.get("assets", {})
    old_dates = old.get("dates", [])

    with open(LATEST) as f:
        tokens = json.load(f)["crypto"]["rows"]
    with open(FUNDS) as f:
        funds = json.load(f)["funds"]

    assets, problems = {}, []

    for i, t in enumerate(tokens):
        key = "token:" + t["id"]
        meta = {"name": f"{t['name']} ({t['symbol']})", "kind": "stable" if t.get("stablecoin") else "crypto", "source": "CoinGecko"}
        try:
            if i:
                time.sleep(PAUSE)
            assets[key] = dict(meta, prices=align(coingecko_daily(t["id"]), dates, carry_forward=False))
        except Exception as e:
            problems.append(f"{key}: {e}")
            if key in old_assets:
                assets[key] = reuse(old_assets[key], old_dates, dates)

    closes = yahoo_closes([f["ticker"] for f in funds])
    for f in funds:
        key = "fund:" + f["ticker"]
        meta = {"name": f"{f['name']} ({f['ticker']})", "kind": "fund", "source": "Yahoo Finance"}
        got = closes.get(f["ticker"])
        if isinstance(got, dict) and got:
            assets[key] = dict(meta, prices=align(got, dates, carry_forward=True))
        else:
            problems.append(f"{key}: {got if isinstance(got, Exception) else 'no data'}")
            if key in old_assets:
                assets[key] = reuse(old_assets[key], old_dates, dates)

    # Keep history for tokens that dropped out of the top 20, so a saved mix can still use them.
    for key, a in old_assets.items():
        if key not in assets:
            assets[key] = reuse(a, old_dates, dates)

    if not any(a.get("prices") for a in assets.values()):
        write_log([f"{now_iso()} history refresh FAILED: nothing could be fetched. Kept the old file."] + problems)
        print("Nothing fetched; kept the old file.")
        return

    missing = []
    for key, a in sorted(assets.items()):
        gaps = [dates[i].isoformat() for i, p in enumerate(a["prices"]) if p is None]
        if gaps:
            missing.append(f"{key}: {len(gaps)} missing day(s), first {gaps[0]}, last {gaps[-1]}")
    write_log([f"{now_iso()} history refresh: {len(assets)} assets, {len(problems)} fetch problem(s), {len(missing)} asset(s) with missing days."]
              + [f"  problem: {p}" for p in problems] + [f"  missing: {m}" for m in missing])

    with open(OUT, "w") as f:
        json.dump({
            "sample": False,
            "source": "CoinGecko daily prices (tokens) and Yahoo Finance daily closing prices (funds).",
            "last_updated": now_iso(),
            "dates": [d.isoformat() for d in dates],
            "assets": assets,
        }, f, separators=(",", ":"))
        f.write("\n")
    print(f"Saved {len(assets)} assets x {len(dates)} days. Problems: {len(problems)}. With gaps: {len(missing)}.")


def reuse(asset, old_dates, dates):
    """Move an asset's old prices onto the new calendar window."""
    by_day = dict(zip(old_dates, asset.get("prices", [])))
    return dict(asset, prices=[by_day.get(d.isoformat()) for d in dates])


def write_log(lines):
    old = open(LOG).readlines() if os.path.exists(LOG) else []
    with open(LOG, "w") as f:
        f.writelines((old + [l + "\n" for l in lines])[-1000:])


if __name__ == "__main__":
    main()

"""Fetch data for the 'Tokenized funds and exchange-traded crypto products' section
and save it into data/tokenized-latest.json.

- Tokenized funds: CoinGecko (price, market value, 24-hour volume). No free
  source gives bid/ask for these, so bid/ask are not stored.
- Exchange-traded products in Europe: Yahoo Finance via yfinance (price in the
  product's own currency, volume today, bid/ask only when within 1% of the price,
  total assets when Yahoo has them).

Each part is fetched separately. If one part fails, its last good data is kept,
"last_error" is set for that part, and the failure is written to
data/tokenized-fetch-log.txt.
"""

import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, "data", "tokenized-config.json")
OUT = os.path.join(ROOT, "data", "tokenized-latest.json")
LOG = os.path.join(ROOT, "data", "tokenized-fetch-log.txt")
BASE = os.environ.get("COINGECKO_BASE", "https://api.coingecko.com/api/v3")
KEY = os.environ.get("COINGECKO_DEMO_KEY", "").strip()
BID_ASK_LIMIT = 0.01


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def num(v):
    return v if isinstance(v, (int, float)) and v == v and v != float("inf") else None


def coingecko(ids):
    headers = {"Accept": "application/json", "User-Agent": "crypto-dashboard-demo"}
    if KEY:
        headers["x-cg-demo-api-key"] = KEY
    url = f"{BASE}/coins/markets?vs_currency=usd&ids={','.join(ids)}"
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            last = ("CoinGecko's free request limit was reached" if e.code == 429 else f"CoinGecko answered with an error (code {e.code})", f"HTTP {e.code}")
        except Exception as e:
            last = ("Could not reach CoinGecko", f"{type(e).__name__}: {e}")
        time.sleep(10 * (attempt + 1))
    raise RuntimeError(*last)


def fetch_tokenized(items):
    data = {c["id"]: c for c in coingecko([i["coingecko_id"] for i in items])}
    if not data:
        raise RuntimeError("CoinGecko returned none of the tokenized funds", "empty answer")
    rows = []
    for i in items:
        c = data.get(i["coingecko_id"], {})
        rows.append({
            "symbol": i["symbol"],
            "price_usd": num(c.get("current_price")),
            "market_value_usd": num(c.get("market_cap")),
            "volume_24h_usd": num(c.get("total_volume")),
            "price_time": c.get("last_updated"),
        })
    return rows


def fetch_exchange_traded(items):
    import yfinance as yf

    rows, ok = [], 0
    for i in items:
        try:
            info = yf.Ticker(i["ticker"]).info or {}
        except Exception:
            info = {}
        price = num(info.get("regularMarketPrice"))
        bid, ask = num(info.get("bid")), num(info.get("ask"))
        if not (price and bid and ask and bid > 0 and ask > 0
                and abs(bid - price) / price <= BID_ASK_LIMIT and abs(ask - price) / price <= BID_ASK_LIMIT):
            bid = ask = None
        t = info.get("regularMarketTime")
        rows.append({
            "ticker": i["ticker"],
            "currency": info.get("currency"),
            "price": price,
            "price_time": datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if isinstance(t, (int, float)) else None,
            "volume": num(info.get("regularMarketVolume")),
            "total_assets": num(info.get("totalAssets")),
            "bid": bid,
            "ask": ask,
        })
        ok += price is not None
    if ok == 0:
        raise RuntimeError("Could not get data from Yahoo", "no prices returned")
    return rows


def run_part(latest, name, fn, items, log):
    try:
        rows = fn(items)
    except Exception as e:
        plain = e.args[0] if e.args else "Unexpected problem"
        detail = e.args[1] if len(e.args) > 1 else repr(e)
        latest[name]["last_error"] = {"time": now_iso(), "message": plain}
        log.append(f"{now_iso()} {name} refresh FAILED: {plain} [{detail}]. Kept the last good data.\n")
        print(name, "failed:", plain, detail)
    else:
        latest[name].update({"last_updated": now_iso(), "last_error": None, "rows": rows})
        print(name, f"saved {len(rows)} rows")


def main():
    with open(CONFIG) as f:
        cfg = json.load(f)
    with open(OUT) as f:
        latest = json.load(f)
    log = []
    run_part(latest, "tokenized", fetch_tokenized, cfg["tokenized"], log)
    run_part(latest, "exchange_traded", fetch_exchange_traded, cfg["exchange_traded"], log)
    latest["_note"] = "Written by scripts/fetch_tokenized.py."
    with open(OUT, "w") as f:
        json.dump(latest, f, indent=2)
        f.write("\n")
    if log:
        old = open(LOG).readlines() if os.path.exists(LOG) else []
        with open(LOG, "w") as f:
            f.writelines((old + log)[-500:])


if __name__ == "__main__":
    main()

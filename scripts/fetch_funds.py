"""Fetch fund data from Yahoo Finance (through the unofficial yfinance library)
and save it into data/funds-latest.json.

Runs on GitHub Actions on a timer during US market hours. If anything fails,
the last good data is kept, the failure is written to data/fetch-log.txt, and
"last_error" is set so the page can say the latest refresh failed.

Rules agreed with the owner:
- Market value = the fund's total assets as reported by Yahoo.
- Yearly fee = Yahoo's figure.
- Bid and ask are kept only when both are within 1% of the price; otherwise
  they are saved as null and the page shows "not available".
"""

import json
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "funds-latest.json")
CONFIG = os.path.join(ROOT, "data", "funds-config.json")
LOG = os.path.join(ROOT, "data", "funds-fetch-log.txt")
NY = ZoneInfo("America/New_York")
BID_ASK_LIMIT = 0.01  # 1%


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def num(v):
    return v if isinstance(v, (int, float)) and v == v and v not in (float("inf"),) else None


def clock_says_open(now_ny):
    if now_ny.weekday() >= 5:
        return False
    minutes = now_ny.hour * 60 + now_ny.minute
    return 9 * 60 + 30 <= minutes < 16 * 60


def sane_bid_ask(price, bid, ask):
    if not (price and bid and ask) or bid <= 0 or ask <= 0:
        return None, None
    if abs(bid - price) / price > BID_ASK_LIMIT or abs(ask - price) / price > BID_ASK_LIMIT:
        return None, None
    return bid, ask


def fetch(tickers):
    import yfinance as yf

    rows, states, problems = [], [], []
    for t in tickers:
        try:
            info = yf.Ticker(t).info or {}
        except Exception as e:
            problems.append(f"{t}: {type(e).__name__}")
            rows.append({"ticker": t})
            continue
        price = num(info.get("regularMarketPrice")) or num(info.get("currentPrice"))
        if price is None:
            problems.append(f"{t}: no price")
        bid, ask = sane_bid_ask(price, num(info.get("bid")), num(info.get("ask")))
        fee = num(info.get("netExpenseRatio"))
        if fee is None:
            fee = num(info.get("annualReportExpenseRatio"))
            fee = fee * 100 if fee is not None and fee < 0.2 else fee  # some fields are fractions
        t_epoch = info.get("regularMarketTime")
        rows.append({
            "ticker": t,
            "price_usd": price,
            "price_time": datetime.fromtimestamp(t_epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if isinstance(t_epoch, (int, float)) else None,
            "volume": num(info.get("regularMarketVolume")),
            "total_assets_usd": num(info.get("totalAssets")),
            "yearly_fee_pct": fee,
            "bid": bid,
            "ask": ask,
        })
        if info.get("marketState"):
            states.append(info["marketState"])
    if len(problems) == len(tickers):
        raise RuntimeError("Yahoo returned no usable fund data (" + "; ".join(problems) + ")")
    return rows, states, problems


def main():
    with open(CONFIG) as f:
        tickers = [x["ticker"] for x in json.load(f)["funds"]]
    with open(OUT) as f:
        latest = json.load(f)

    try:
        rows, states, problems = fetch(tickers)
    except Exception as e:
        msg = "Could not get fund data from Yahoo"
        latest["last_error"] = {"time": now_iso(), "message": msg}
        lines = open(LOG).readlines() if os.path.exists(LOG) else []
        lines.append(f"{now_iso()} funds refresh FAILED: {msg} [{e}]. Kept the last good data.\n")
        with open(LOG, "w") as f:
            f.writelines(lines[-500:])
        print("Refresh failed, kept last good data:", e)
    else:
        # Open only if the clock says so AND Yahoo agrees (this catches US holidays).
        open_now = clock_says_open(datetime.now(NY)) and (not states or "REGULAR" in states)
        latest = {
            "sample": False,
            "source": "Yahoo Finance (unofficial access through the yfinance library).",
            "source_url": "https://finance.yahoo.com/",
            "last_updated": now_iso(),
            "market_status": "open" if open_now else "closed",
            "last_error": None,
            "partial_problems": problems,
            "rows": rows,
        }
        print(f"Saved {len(rows)} funds. Market {'open' if open_now else 'closed'}. Problems: {problems or 'none'}")

    with open(OUT, "w") as f:
        json.dump(latest, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()

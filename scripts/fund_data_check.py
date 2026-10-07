"""V1-1 fund data check.

For each fund in data/funds-config.json, ask Yahoo Finance (through the
unofficial yfinance library) for price, volume, bid, ask, shares outstanding,
yearly fee and total assets, and record what came back and what is missing.
Then try Stooq (free, end-of-day only) on the same funds as a backup source.

Writes a plain table to reports/fund-data-raw.md. Changes nothing on the site.
"""

import csv
import io
import json
import os
import traceback
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "reports", "fund-data-raw.md")

FIELDS = [
    ("price", ["regularMarketPrice", "currentPrice", "navPrice"]),
    ("volume", ["regularMarketVolume", "volume"]),
    ("bid", ["bid"]),
    ("ask", ["ask"]),
    ("shares outstanding", ["sharesOutstanding", "impliedSharesOutstanding"]),
    ("yearly fee", ["netExpenseRatio", "annualReportExpenseRatio", "expenseRatio"]),
    ("total assets", ["totalAssets"]),
]


def pick(info, keys):
    for k in keys:
        v = info.get(k)
        if v not in (None, 0, 0.0, "", "Infinity"):
            return f"{v} ({k})"
    # Report zero separately: Yahoo often sends 0 for bid/ask when it has nothing.
    for k in keys:
        if info.get(k) in (0, 0.0):
            return f"MISSING (0 from {k})"
    return "MISSING"


def yahoo(tickers):
    import yfinance as yf

    rows = {}
    for t in tickers:
        try:
            tk = yf.Ticker(t)
            info = tk.info or {}
            row = {name: pick(info, keys) for name, keys in FIELDS}
            row["exchange"] = str(info.get("fullExchangeName") or info.get("exchange") or "MISSING")
            row["market state"] = str(info.get("marketState") or "MISSING")
            try:
                h = tk.history(period="5d")
                row["5-day history"] = f"{len(h)} days" if len(h) else "MISSING"
            except Exception as e:
                row["5-day history"] = f"ERROR {type(e).__name__}"
        except Exception as e:
            row = {"error": f"{type(e).__name__}: {e}"}
            traceback.print_exc()
        rows[t] = row
    return rows


def stooq(tickers):
    rows = {}
    for t in tickers:
        url = f"https://stooq.com/q/l/?s={t.lower()}.us&f=sd2t2ohlcv&h&e=csv"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "crypto-dashboard-demo"})
            with urllib.request.urlopen(req, timeout=30) as res:
                text = res.read().decode("utf-8", "replace")
            data = list(csv.DictReader(io.StringIO(text)))
            if data and data[0].get("Close") not in (None, "", "N/D"):
                d = data[0]
                rows[t] = f"close {d['Close']}, volume {d.get('Volume')}, date {d.get('Date')} {d.get('Time')}"
            else:
                rows[t] = "MISSING (answer: " + text.strip().replace("\n", " | ")[:120] + ")"
        except Exception as e:
            rows[t] = f"ERROR {type(e).__name__}: {e}"
    return rows


def main():
    with open(os.path.join(ROOT, "data", "funds-config.json")) as f:
        tickers = [x["ticker"] for x in json.load(f)["funds"]]

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out = [f"# Fund data check: raw output\n", f"Run at {now} on GitHub Actions.\n"]

    try:
        import yfinance
        out.append(f"\n## Yahoo Finance (yfinance {yfinance.__version__})\n")
        y = yahoo(tickers)
        cols = [n for n, _ in FIELDS] + ["exchange", "market state", "5-day history"]
        out.append("| Fund | " + " | ".join(cols) + " |")
        out.append("|" + "---|" * (len(cols) + 1))
        for t in tickers:
            r = y[t]
            if "error" in r:
                out.append(f"| {t} | ERROR: {r['error']} |" + " |" * (len(cols) - 1))
            else:
                out.append(f"| {t} | " + " | ".join(r.get(c, "") for c in cols) + " |")
    except Exception as e:
        out.append(f"\nYahoo check could not run: {type(e).__name__}: {e}\n")

    out.append("\n## Stooq (backup, end-of-day only)\n")
    s = stooq(tickers)
    out.append("| Fund | Result |")
    out.append("|---|---|")
    for t in tickers:
        out.append(f"| {t} | {s[t]} |")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        f.write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()

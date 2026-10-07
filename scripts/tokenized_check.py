"""Slice 3 source check (testing only, nothing on the site uses this).

What free sources say about:
- tokenized funds (fund shares issued as tokens on a blockchain), and
- exchange-traded crypto products listed outside the USA.

Writes reports/tokenized-raw.md.
"""

import json
import os
import time
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "reports", "tokenized-raw.md")
CG = "https://api.coingecko.com/api/v3"
lines = []


def say(s=""):
    print(s)
    lines.append(s)


def get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "crypto-dashboard-demo"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def cg(path):
    for attempt in range(3):
        try:
            data = get(CG + path)
            time.sleep(7)
            return data
        except Exception as e:
            err = e
            time.sleep(30)
    raise err


say("# Slice 3 source check: raw output")
say(f"Run at {datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC} on GitHub Actions.")

# 1. CoinGecko categories that look like tokenized funds
say("\n## CoinGecko: categories")
try:
    cats = cg("/coins/categories/list")
    words = ("tokeniz", "real world", "rwa", "treasur", "money market", "fund")
    hits = [c for c in cats if any(w in (c.get("name", "") + c.get("category_id", "")).lower() for w in words)]
    for c in hits:
        say(f"- {c['category_id']}: {c['name']}")
    for c in hits[:6]:
        say(f"\n### Category {c['category_id']} (top 12 by market value)")
        say("| Name | Symbol | Price USD | Market value USD | 24h volume USD | Last updated |")
        say("|---|---|---|---|---|---|")
        try:
            for m in cg(f"/coins/markets?vs_currency=usd&category={c['category_id']}&order=market_cap_desc&per_page=12&page=1"):
                say(f"| {m.get('name')} | {m.get('symbol')} | {m.get('current_price')} | {m.get('market_cap')} | {m.get('total_volume')} | {m.get('last_updated')} |")
        except Exception as e:
            say(f"ERROR {type(e).__name__}: {e}")
except Exception as e:
    say(f"ERROR {type(e).__name__}: {e}")

# 2. Well-known tokenized funds by name
say("\n## CoinGecko: search for well-known tokenized funds")
for q in ["BUIDL", "BENJI", "OUSG", "USDY", "USTB", "USYC", "WisdomTree"]:
    try:
        res = cg(f"/search?query={q}").get("coins", [])[:3]
        say(f"- {q}: " + ("; ".join(f"{c['id']} ({c['symbol']}, rank {c.get('market_cap_rank')})" for c in res) or "no match"))
    except Exception as e:
        say(f"- {q}: ERROR {type(e).__name__}: {e}")

# 3. DefiLlama real-world-asset protocols (total value held)
say("\n## DefiLlama: RWA protocols (top 15 by total value held)")
try:
    prot = [p for p in get("https://api.llama.fi/protocols") if (p.get("category") or "").upper() == "RWA"]
    prot.sort(key=lambda p: p.get("tvl") or 0, reverse=True)
    say("| Name | Total value held USD | Chains |")
    say("|---|---|---|")
    for p in prot[:15]:
        say(f"| {p.get('name')} | {round(p.get('tvl') or 0)} | {', '.join((p.get('chains') or [])[:3])} |")
except Exception as e:
    say(f"ERROR {type(e).__name__}: {e}")

# 4. Yahoo: exchange-traded crypto products outside the USA, plus the fund behind BENJI
say("\n## Yahoo Finance: non-US exchange-traded crypto products and FOBXX")
try:
    import yfinance as yf
    say("| Ticker | Name | Currency | Exchange | Price | Volume | Bid | Ask | Total assets | Market state |")
    say("|---|---|---|---|---|---|---|---|---|---|")
    for t in ["ABTC.SW", "BTCE.DE", "BITC.SW", "VBTC.DE", "ZETH.DE", "AETH.SW", "FOBXX"]:
        try:
            i = yf.Ticker(t).info or {}
            say(f"| {t} | {i.get('longName') or i.get('shortName')} | {i.get('currency')} | {i.get('fullExchangeName')} | "
                f"{i.get('regularMarketPrice')} | {i.get('regularMarketVolume')} | {i.get('bid')} | {i.get('ask')} | "
                f"{i.get('totalAssets')} | {i.get('marketState')} |")
        except Exception as e:
            say(f"| {t} | ERROR {type(e).__name__}: {e} |||||||||")
except Exception as e:
    say(f"ERROR {type(e).__name__}: {e}")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    f.write("\n".join(lines) + "\n")

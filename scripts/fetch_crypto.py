"""Fetch the top crypto tokens by 24-hour volume from CoinGecko and save them
into data/latest.json (the "crypto" part only).

Runs on GitHub Actions on a timer. If anything fails, the last good data is
kept, the failure is written to data/fetch-log.txt, and "last_error" is set so
the page can say the latest refresh failed.

No API key is needed. If a free CoinGecko "demo" key is stored in the GitHub
secret COINGECKO_DEMO_KEY, it is sent; it is never written into any file.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LATEST = os.path.join(ROOT, "data", "latest.json")
LOG = os.path.join(ROOT, "data", "fetch-log.txt")
SETTINGS = os.path.join(ROOT, "data", "settings.json")

BASE = os.environ.get("COINGECKO_BASE", "https://api.coingecko.com/api/v3")
KEY = os.environ.get("COINGECKO_DEMO_KEY", "").strip()


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_json(path, tries=3):
    headers = {"Accept": "application/json", "User-Agent": "crypto-dashboard-demo"}
    if KEY:
        headers["x-cg-demo-api-key"] = KEY
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(BASE + path, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.load(res)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                last = ("CoinGecko's free request limit was reached", f"HTTP {e.code}")
            elif e.code in (401, 403):
                last = ("CoinGecko refused the request", f"HTTP {e.code}")
            else:
                last = (f"CoinGecko answered with an error (code {e.code})", f"HTTP {e.code}")
        except json.JSONDecodeError as e:
            last = ("CoinGecko sent data that could not be read", repr(e))
        except Exception as e:  # network problems
            last = ("Could not reach CoinGecko", f"{type(e).__name__}: {e}")
        time.sleep(10 * (attempt + 1))
    raise FetchError(*last)


class FetchError(Exception):
    """plain: short message for the page. detail: technical detail for the log."""

    def __init__(self, plain, detail=""):
        super().__init__(plain)
        self.plain = plain
        self.detail = detail


def fetch(count):
    markets = get_json(
        f"/coins/markets?vs_currency=usd&order=volume_desc&per_page={count}&page=1"
    )
    stable = get_json(
        "/coins/markets?vs_currency=usd&category=stablecoins&order=market_cap_desc&per_page=250&page=1"
    )
    if not isinstance(markets, list) or len(markets) == 0:
        raise FetchError("CoinGecko returned no tokens")
    stable_ids = {c.get("id") for c in stable if isinstance(c, dict)}
    rows = []
    for c in markets[:count]:
        rows.append({
            "id": c.get("id"),
            "name": c.get("name"),
            "symbol": (c.get("symbol") or "").upper(),
            "stablecoin": c.get("id") in stable_ids,
            "price_usd": c.get("current_price"),
            "market_value_usd": c.get("market_cap"),
            "volume_24h_usd": c.get("total_volume"),
        })
    return rows


def main():
    with open(LATEST) as f:
        latest = json.load(f)
    with open(SETTINGS) as f:
        count = int(json.load(f).get("crypto_token_count", 20))

    try:
        rows = fetch(count)
    except Exception as e:
        msg = getattr(e, "plain", "Unexpected problem while reading CoinGecko data")
        detail = getattr(e, "detail", "") or repr(e)
        latest["crypto"]["last_error"] = {"time": now_iso(), "message": msg}
        lines = open(LOG).readlines() if os.path.exists(LOG) else []
        lines.append(f"{now_iso()} crypto refresh FAILED: {msg} [{detail}]. Kept the last good data.\n")
        with open(LOG, "w") as f:
            f.writelines(lines[-500:])  # keep the log small
        print("Refresh failed, kept last good data:", msg)
    else:
        latest["crypto"] = {
            "sample": False,
            "source": "CoinGecko free API (top tokens by 24-hour trading volume, re-ranked on every refresh).",
            "source_url": "https://www.coingecko.com/",
            "last_updated": now_iso(),
            "last_error": None,
            "rows": rows,
        }
        print(f"Saved {len(rows)} tokens.")

    with open(LATEST, "w") as f:
        json.dump(latest, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    sys.exit(main())

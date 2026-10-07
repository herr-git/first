// Prices for paper trading, shared by the paper trading page and the dashboard summary.
// Reads the same data files as the dashboard. The page never calls a data provider directly.

async function getJson(path) {
  let res;
  try { res = await fetch(path, { cache: 'no-store' }); }
  catch (e) { throw new Error(path + ' could not be loaded. If you opened this file straight from your computer, open the web link instead.'); }
  if (!res.ok) throw new Error(path + ' could not be loaded (the server answered ' + res.status + ').');
  try { return await res.json(); }
  catch (e) { throw new Error(path + ' could not be read: the file is damaged or incomplete.'); }
}

// Tokens and US-listed funds that can be traded. Tokenized funds are view only, so they are not here.
async function loadMarket() {
  const [settings, latest, funds, fundsConfig] = await Promise.all([
    getJson('data/settings.json'), getJson('data/latest.json'),
    getJson('data/funds-latest.json'), getJson('data/funds-config.json'),
  ]);
  const assets = {};
  (latest.crypto.rows || []).forEach(t => {
    assets['token:' + t.id] = {
      key: 'token:' + t.id, kind: 'crypto', group: 'Crypto tokens',
      name: `${t.name} (${t.symbol})`, unit: t.symbol, unitOne: t.symbol,
      price: t.price_usd, priceTime: latest.crypto.last_updated, source: 'CoinGecko',
    };
  });
  const byTicker = Object.fromEntries((funds.rows || []).map(r => [r.ticker, r]));
  fundsConfig.funds.forEach(f => {
    const r = byTicker[f.ticker] || {};
    assets['fund:' + f.ticker] = {
      key: 'fund:' + f.ticker, kind: 'fund', group: 'US crypto funds',
      name: `${f.name} (${f.ticker})`, unit: f.ticker + ' shares', unitOne: f.ticker + ' share',
      price: r.price_usd, priceTime: r.price_time || funds.last_updated, source: 'Yahoo Finance',
    };
  });
  return { settings, assets, cryptoUpdated: latest.crypto.last_updated, fundsUpdated: funds.last_updated };
}

// The price to value a holding with right now: { price, priceTime, ok } or null when there is no current price.
// ok is false when the price is older than the limit (see PaperAccount.checkPrice).
function priceFor(market, key, now) {
  const a = market.assets[key];
  if (!a || typeof a.price !== 'number') return null;
  const check = PaperAccount.checkPrice(a, now || new Date(), market.settings.stale_after_minutes);
  return { price: a.price, priceTime: a.priceTime, ok: check.ok };
}

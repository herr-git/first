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
// The crypto prices and the US fund prices are loaded separately: if one file fails, the other part
// still works, and cryptoError / fundsError say what went wrong. Only when both fail does this throw.
async function loadMarket() {
  const settings = await getJson('data/settings.json');
  const [latestR, fundsR] = await Promise.allSettled([
    getJson('data/latest.json'),
    Promise.all([getJson('data/funds-latest.json'), getJson('data/funds-config.json')]),
  ]);
  if (latestR.status === 'rejected' && fundsR.status === 'rejected') {
    throw new Error(latestR.reason.message + ' ' + fundsR.reason.message);
  }
  const market = { settings, assets: {}, cryptoUpdated: null, fundsUpdated: null, cryptoError: null, fundsError: null, loadedAt: new Date().toISOString() };
  if (latestR.status === 'fulfilled') {
    const latest = latestR.value;
    market.cryptoUpdated = latest.crypto.last_updated;
    (latest.crypto.rows || []).forEach(t => {
      market.assets['token:' + t.id] = {
        key: 'token:' + t.id, kind: 'crypto', group: 'Crypto tokens',
        name: `${t.name} (${t.symbol})`, unit: t.symbol, unitOne: t.symbol,
        price: t.price_usd, priceTime: latest.crypto.last_updated, source: 'CoinGecko',
      };
    });
  } else {
    market.cryptoError = latestR.reason.message;
  }
  if (fundsR.status === 'fulfilled') {
    const [funds, fundsConfig] = fundsR.value;
    market.fundsUpdated = funds.last_updated;
    const byTicker = Object.fromEntries((funds.rows || []).map(r => [r.ticker, r]));
    fundsConfig.funds.forEach(f => {
      const r = byTicker[f.ticker] || {};
      market.assets['fund:' + f.ticker] = {
        key: 'fund:' + f.ticker, kind: 'fund', group: 'US crypto funds',
        name: `${f.name} (${f.ticker})`, unit: f.ticker + ' shares', unitOne: f.ticker + ' share',
        price: r.price_usd, priceTime: r.price_time || funds.last_updated, source: 'Yahoo Finance',
      };
    });
  } else {
    market.fundsError = fundsR.reason.message;
  }
  return market;
}

// Why a held asset has no current price, in plain words, or null if the reason is not a failed file.
function missingReason(market, key) {
  if (key.startsWith('fund:') && market.fundsError) return 'US fund prices could not be loaded right now.';
  if (key.startsWith('token:') && market.cryptoError) return 'Crypto prices could not be loaded right now.';
  return null;
}

// The price to value a holding with right now: { price, priceTime, ok } or null when there is no current price.
// ok is false when the price is older than the limit (see PaperAccount.checkPrice).
function priceFor(market, key, now) {
  const a = market.assets[key];
  if (!a || typeof a.price !== 'number') return null;
  const check = PaperAccount.checkPrice(a, now || new Date(), market.settings.paper_max_price_age_minutes);
  return { price: a.price, priceTime: a.priceTime, ok: check.ok };
}

// The paper (pretend) trading account.
// Saved in the visitor's own browser (localStorage) only. Nothing is sent anywhere,
// and no personal data is stored: just pretend cash, holdings and pretend orders.

const STARTING_CASH = 100000;          // pretend US dollars
const STORAGE_KEY = 'paper-account';   // one entry in this browser's storage
const ACCOUNT_VERSION = 1;

function newAccount(now) {
  const t = (now || new Date()).toISOString();
  return {
    version: ACCOUNT_VERSION,
    created: t,
    updated: t,
    cash: STARTING_CASH,
    holdings: {},  // key ("token:bitcoin" or "fund:IBIT") -> { quantity, cost, name }
    orders: [],    // list of pretend orders, oldest first
  };
}

// Check that saved data looks like an account before using it.
function isValidAccount(a) {
  return !!a && a.version === ACCOUNT_VERSION && typeof a.cash === 'number' && isFinite(a.cash) && a.cash >= 0 &&
    a.holdings && typeof a.holdings === 'object' && !Array.isArray(a.holdings) && Array.isArray(a.orders) &&
    Object.values(a.holdings).every(h => h && typeof h.quantity === 'number' && h.quantity > 0 && typeof h.cost === 'number');
}

// Returns { account, status } where status is:
//   'new'       nothing saved yet: a fresh account
//   'loaded'    saved account found
//   'damaged'   something is saved but cannot be read (it is NOT overwritten)
//   'blocked'   this browser does not allow saving
function loadAccount(storage) {
  let text;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch (e) {
    return { account: newAccount(), status: 'blocked' };
  }
  if (text === null || text === undefined) return { account: newAccount(), status: 'new' };
  try {
    const a = JSON.parse(text);
    if (isValidAccount(a)) return { account: a, status: 'loaded' };
  } catch (e) { /* fall through */ }
  return { account: null, status: 'damaged' };
}

// Returns true if saved, false if this browser refused.
function saveAccount(storage, account) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(account));
    return true;
  } catch (e) {
    return false;
  }
}

// Start over: a fresh account replaces whatever was saved.
function resetAccount(storage, now) {
  const a = newAccount(now);
  return { account: a, saved: saveAccount(storage, a) };
}

// ---------- Pretend orders (slice 2b) ----------

const QTY_DECIMALS = 8;   // fractions of a token or fund share are allowed
const DUST = 1e-8;        // a holding smaller than this counts as sold out

function cents(v) { return Math.round(v * 100) / 100; }
function roundQty(v) { return Math.round(v * 1e8) / 1e8; }

// Is the US stock market open at this moment? Weekdays 9:30 to 16:00 New York time.
// US holidays are not known here.
function usMarketOpen(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(now);
  const get = t => (parts.find(p => p.type === t) || {}).value;
  if (get('weekday') === 'Sat' || get('weekday') === 'Sun') return false;
  const mins = Number(get('hour')) * 60 + Number(get('minute'));
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

// Can this price be used for a pretend order right now?
// p: { kind: 'crypto' | 'fund', price, priceTime (ISO) }
// Returns { ok, reason, ageMinutes, marketClosed }.
const CLOSED_MARKET_MAX_DAYS = 4; // covers a weekend plus a holiday
function checkPrice(p, now, limitMinutes) {
  if (!p || typeof p.price !== 'number' || !isFinite(p.price) || p.price <= 0) {
    return { ok: false, reason: 'There is no current price for this asset.' };
  }
  const t = new Date(p.priceTime);
  if (!p.priceTime || isNaN(t)) return { ok: false, reason: 'The time of this price is unknown.' };
  const ageMinutes = (now - t) / 60000;
  if (p.kind === 'fund' && !usMarketOpen(now)) {
    if (ageMinutes > CLOSED_MARKET_MAX_DAYS * 24 * 60) {
      return { ok: false, ageMinutes, marketClosed: true, reason: `The US market is closed and the last price collected is more than ${CLOSED_MARKET_MAX_DAYS} days old.` };
    }
    return { ok: true, ageMinutes, marketClosed: true };
  }
  if (ageMinutes > limitMinutes) {
    return { ok: false, ageMinutes, reason: `This price is ${ageText(ageMinutes)} old. The limit is ${limitMinutes} minutes.` };
  }
  return { ok: true, ageMinutes };
}

function ageText(minutes) {
  if (minutes < 120) return Math.round(minutes) + ' minutes';
  if (minutes < 48 * 60) return Math.round(minutes / 60) + ' hours';
  return Math.round(minutes / 1440) + ' days';
}

// Buy: spend `amount` pretend dollars at `price`. Never more than the cash available.
// asset: { key, name }. Returns { ok, account, order } or { ok: false, reason }. The input account is not changed.
function buy(account, asset, amount, price, priceTime, now) {
  amount = cents(Number(amount));
  if (!(amount > 0)) return { ok: false, reason: 'Enter an amount above $0.' };
  if (!(price > 0)) return { ok: false, reason: 'There is no current price for this asset.' };
  if (amount > cents(account.cash) + 1e-9) {
    return { ok: false, reason: `Not enough pretend cash. You have $${fmt(account.cash)}.` };
  }
  const quantity = roundQty(amount / price);
  if (!(quantity > 0)) return { ok: false, reason: 'This amount is too small to buy any of this asset.' };
  const a = JSON.parse(JSON.stringify(account));
  const h = a.holdings[asset.key] || { quantity: 0, cost: 0, name: asset.name };
  h.quantity = roundQty(h.quantity + quantity);
  h.cost = cents(h.cost + amount);
  h.name = asset.name;
  h.lastPrice = price;
  h.lastPriceTime = priceTime;
  a.holdings[asset.key] = h;
  a.cash = cents(a.cash - amount);
  return finish(a, { side: 'buy', key: asset.key, name: asset.name, quantity, price, priceTime, amount }, now);
}

// Sell: get `amount` pretend dollars, or everything owned when sellAll is true. Never more than owned.
function sell(account, asset, amount, price, priceTime, now, sellAll) {
  const h = account.holdings[asset.key];
  if (!h || !(h.quantity > 0)) return { ok: false, reason: 'You do not own any of this asset.' };
  if (!(price > 0)) return { ok: false, reason: 'There is no current price for this asset.' };
  let quantity;
  if (sellAll) {
    quantity = h.quantity;
    amount = cents(quantity * price);
  } else {
    amount = cents(Number(amount));
    if (!(amount > 0)) return { ok: false, reason: 'Enter an amount above $0.' };
    quantity = roundQty(amount / price);
    if (quantity > h.quantity + DUST) {
      return { ok: false, reason: `You only own ${fmtQty(h.quantity)}, worth about $${fmt(h.quantity * price)}. Choose a smaller amount or "Sell all".` };
    }
    quantity = Math.min(quantity, h.quantity);
  }
  const a = JSON.parse(JSON.stringify(account));
  const left = roundQty(h.quantity - quantity);
  if (left <= DUST) delete a.holdings[asset.key];
  else {
    const nh = a.holdings[asset.key];
    nh.cost = cents(nh.cost * (left / h.quantity)); // average cost of what is left
    nh.quantity = left;
    nh.lastPrice = price;
    nh.lastPriceTime = priceTime;
  }
  a.cash = cents(a.cash + amount);
  return finish(a, { side: 'sell', key: asset.key, name: asset.name, quantity, price, priceTime, amount }, now);
}

function finish(a, order, now) {
  const t = (now || new Date()).toISOString();
  order.time = t;
  order.id = a.orders.length + 1;
  a.orders.push(order);
  a.updated = t;
  return { ok: true, account: a, order };
}

// ---------- Portfolio (slice 2c) ----------

// What the account is worth now.
// priceFor(key) returns { price, priceTime, ok } from the latest data, or null when the asset has no current price.
// A holding with no current price is valued at its last known price and marked 'not-updated'.
// A holding whose current price is older than the limit is marked 'old'.
function portfolio(account, priceFor) {
  const rows = Object.entries(account.holdings).map(([key, h]) => {
    const p = priceFor(key);
    let price, priceTime, status;
    if (p && typeof p.price === 'number' && isFinite(p.price) && p.price > 0) {
      price = p.price; priceTime = p.priceTime; status = p.ok ? 'ok' : 'old';
    } else {
      price = h.lastPrice; priceTime = h.lastPriceTime; status = 'not-updated';
    }
    const exact = h.quantity * price;
    return {
      key, name: h.name, quantity: h.quantity, price, priceTime, status,
      exact, value: cents(exact), cost: h.cost,
      gain: cents(exact - h.cost),
      gainPct: h.cost > 0 ? ((exact - h.cost) / h.cost) * 100 : null,
    };
  }).sort((a, b) => b.exact - a.exact);
  const holdingsValue = cents(rows.reduce((s, r) => s + r.exact, 0));
  const total = cents(account.cash + holdingsValue);
  return {
    cash: account.cash, holdingsValue, total,
    change: cents(total - STARTING_CASH),
    changePct: ((total - STARTING_CASH) / STARTING_CASH) * 100,
    rows,
  };
}

function fmt(v) { return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtQty(q) { return q.toLocaleString('en-US', { maximumFractionDigits: QTY_DECIMALS }); }

const PaperAccount = { STARTING_CASH, STORAGE_KEY, newAccount, isValidAccount, loadAccount, saveAccount, resetAccount,
  usMarketOpen, checkPrice, ageText, buy, sell, portfolio, cents, fmt, fmtQty };
if (typeof module !== 'undefined') module.exports = PaperAccount;

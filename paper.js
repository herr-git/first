// Paper trading page.
// 2a: the pretend account balance, saved in this browser, and Start over.
// 2b: pretend buy and sell orders at the latest price shown, with checks for cash, holdings and old prices.

let account = null;
let canSave = true;
let storage = null;
let market = null;      // { settings, assets: {key: asset}, cryptoUpdated, fundsUpdated }
let pending = null;     // the order waiting for "Place pretend order"

const $ = id => document.getElementById(id);

function storageArea() {
  try { return window.localStorage; } catch (e) { return null; }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function dollars(v) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Prices under $1 keep more decimals, for example $0.2255.
function priceText(v) {
  const d = v >= 1 ? 2 : v >= 0.01 ? 4 : 6;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function when(iso) {
  const d = new Date(iso);
  return !iso || isNaN(d) ? 'unknown' : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

function save() {
  canSave = storage ? PaperAccount.saveAccount(storage, account) : false;
}

// ---------- Account panel (2a) ----------

function showAccount() {
  $('account-loading').hidden = true;
  $('account-body').hidden = false;
  $('cash').textContent = dollars(account.cash);
  $('account-meta').innerHTML =
    '<strong>Where this comes from:</strong> the account starts with 100,000 pretend US dollars, set by this demo. It changes only through your pretend orders.' +
    '<br><strong>Last updated:</strong> your paper account was last changed on ' + esc(when(account.updated)) + '.';
  $('storage-note').textContent = canSave
    ? 'Saved in this browser only. If you clear your browser data, or use another device or browser, you start again with a new account.'
    : 'This browser does not allow saving, so your paper account will be lost when you close this page.';
  $('storage-note').className = canSave ? 'note' : 'error';
}

function showDamaged() {
  $('account-loading').hidden = true;
  const box = $('account-error');
  box.hidden = false;
  box.textContent = 'Your saved paper account could not be read. It has not been changed. Choose "Start over" to begin again with 100,000 pretend US dollars.';
  $('account-body').hidden = false;
  $('cash').textContent = 'not available';
  $('account-meta').innerHTML =
    '<strong>Where this comes from:</strong> the paper account saved in this browser.<br><strong>Last updated:</strong> unknown, because it could not be read.';
}

// ---------- Prices ----------

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

function showPricesMeta() {
  $('prices-meta').innerHTML =
    '<strong>Where prices come from:</strong> CoinGecko (crypto tokens) and Yahoo Finance (US funds, delayed 15 minutes).' +
    '<br><strong>Last updated:</strong> crypto ' + esc(when(market.cryptoUpdated)) + '; US funds ' + esc(when(market.fundsUpdated)) + '.';
}

// ---------- Order form (2b) ----------

function side() { return $('side-sell').checked ? 'sell' : 'buy'; }

function fillAssetList() {
  const sel = $('asset');
  const keep = sel.value;
  let options = '';
  if (side() === 'buy') {
    ['Crypto tokens', 'US crypto funds'].forEach(g => {
      const items = Object.values(market.assets).filter(a => a.group === g);
      options += `<optgroup label="${g}">` + items.map(a => `<option value="${esc(a.key)}">${esc(a.name)}</option>`).join('') + '</optgroup>';
    });
  } else {
    options = Object.entries(account.holdings).map(([key, h]) =>
      `<option value="${esc(key)}">${esc(h.name)}</option>`).join('');
  }
  sel.innerHTML = options;
  if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
  const nothing = side() === 'sell' && Object.keys(account.holdings).length === 0;
  $('asset-empty').hidden = !nothing;
  sel.disabled = nothing;
}

// The asset as it can be traded now: price, time, and whether the price may be used.
function current(key) {
  const a = market.assets[key];
  const h = account.holdings[key];
  const base = a || (h ? { key, kind: key.startsWith('fund:') ? 'fund' : 'crypto', name: h.name, price: null, priceTime: null } : null);
  if (!base) return null;
  const check = PaperAccount.checkPrice(base, new Date(), market.settings.stale_after_minutes);
  if (!a && h) check.reason = 'This token is no longer in the top 20, so there is no current price. Trading it is paused until it is back in the list.';
  return Object.assign({}, base, { check });
}

function showPrice() {
  const box = $('price-box');
  const c = current($('asset').value);
  if (!c) { box.innerHTML = ''; return; }
  let html = '';
  if (typeof c.price === 'number') {
    html += `<p class="price-line"><span class="price-big">${priceText(c.price)}</span> latest price of one ${esc(c.unitOne || 'unit')}</p>` +
      `<p class="price-time">Price as of ${esc(when(c.priceTime))} (${esc(c.source)})</p>`;
  } else {
    html += '<p class="price-line">Latest price: not available</p>';
  }
  if (c.check.ok && c.check.marketClosed) {
    html += '<p class="price-status closed">The US market is closed. Pretend orders use the last price collected, shown above.</p>';
  } else if (!c.check.ok) {
    html += `<p class="price-status blocked"><strong>Trading paused:</strong> ${esc(c.check.reason)} Prices update when the data job runs.</p>`;
  }
  const h = account.holdings[c.key];
  if (h) {
    html += `<p class="owned">You own ${esc(PaperAccount.fmtQty(h.quantity))} ${esc(c.unit || '')}` +
      (typeof c.price === 'number' ? `, worth about ${dollars(h.quantity * c.price)} at this price.` : '.') + '</p>';
  }
  box.innerHTML = html;
  $('review-btn').disabled = !c.check.ok;
  updateHint();
}

function readAmount() {
  const raw = $('amount').value.replace(/[$,\s]/g, '');
  return raw === '' ? NaN : Number(raw);
}

function updateHint() {
  const c = current($('asset').value);
  const hint = $('amount-hint');
  const sellAll = side() === 'sell' && $('sell-all').checked;
  $('amount').disabled = sellAll;
  if (!c || typeof c.price !== 'number') { hint.textContent = ''; return; }
  if (sellAll) {
    const h = account.holdings[c.key];
    hint.textContent = h ? `Sells all ${PaperAccount.fmtQty(h.quantity)} ${c.unit}, about ${dollars(h.quantity * c.price)}.` : '';
    return;
  }
  const amt = readAmount();
  if (!(amt > 0)) {
    hint.textContent = side() === 'buy' ? `You have ${dollars(account.cash)} pretend cash.` : '';
    return;
  }
  const q = Math.round((amt / c.price) * 1e8) / 1e8;
  hint.textContent = (side() === 'buy' ? 'Buys about ' : 'Sells about ') + PaperAccount.fmtQty(q) + ' ' + c.unit + '.';
}

function onSideChange() {
  const sell = side() === 'sell';
  $('sell-all-wrap').hidden = !sell;
  if (!sell) $('sell-all').checked = false;
  $('amount-label').textContent = sell ? 'Amount to sell, in pretend US dollars' : 'Amount to spend, in pretend US dollars';
  closeReview();
  fillAssetList();
  showPrice();
}

// Try the order without saving it. Returns { ok, account, order } or { ok: false, reason }.
function tryOrder(c) {
  const now = new Date();
  const asset = { key: c.key, name: c.name };
  return side() === 'buy'
    ? PaperAccount.buy(account, asset, readAmount(), c.price, c.priceTime, now)
    : PaperAccount.sell(account, asset, readAmount(), c.price, c.priceTime, now, $('sell-all').checked);
}

async function review(ev) {
  ev.preventDefault();
  $('order-done').hidden = true;
  $('review-error').hidden = true;
  // Collect the prices again first, so a page left open for a long time cannot use an old price.
  try {
    market = await loadMarket();
    showPricesMeta();
  } catch (err) {
    showOrderError('Prices could not be loaded, so no pretend order can be placed. ' + err.message);
    return;
  }
  showPrice();
  const c = current($('asset').value);
  if (!c) return;
  if (!c.check.ok) return; // the price box already says why
  const r = tryOrder(c);
  if (!r.ok) {
    $('amount-hint').innerHTML = '<span class="bad">' + esc(r.reason) + '</span>';
    return;
  }
  pending = { key: c.key, side: side(), price: c.price, priceTime: c.priceTime };
  const o = r.order;
  $('review-list').innerHTML =
    `<dt>Order</dt><dd>${o.side === 'buy' ? 'Buy' : 'Sell'} ${esc(c.name)}</dd>` +
    `<dt>Amount</dt><dd>${dollars(o.amount)} pretend US dollars</dd>` +
    `<dt>Quantity</dt><dd>${esc(PaperAccount.fmtQty(o.quantity))} ${esc(c.unit)}</dd>` +
    `<dt>Price</dt><dd>${priceText(o.price)} per ${esc(c.unitOne)}</dd>` +
    `<dt>Price as of</dt><dd>${esc(when(o.priceTime))} (${esc(c.source)})${c.check.marketClosed ? ', last price before the US market closed' : ''}</dd>` +
    `<dt>Pretend cash after</dt><dd>${dollars(r.account.cash)}</dd>`;
  $('order-form').hidden = true;
  $('review').hidden = false;
  $('place-btn').focus();
}

function place() {
  const c = current(pending.key);
  // Check the price again at the moment of placing: time has passed since the review.
  if (!c || !c.check.ok || c.price !== pending.price || c.priceTime !== pending.priceTime) {
    $('review-error').hidden = false;
    $('review-error').textContent = c && !c.check.ok
      ? 'Not placed. ' + c.check.reason
      : 'Not placed: the price changed since you reviewed this order. Choose "Change" and review it again.';
    return;
  }
  const r = tryOrder(c);
  if (!r.ok) {
    $('review-error').hidden = false;
    $('review-error').textContent = 'Not placed. ' + r.reason;
    return;
  }
  account = r.account;
  save();
  const o = r.order;
  closeReview();
  $('amount').value = '';
  $('sell-all').checked = false;
  showAccount();
  fillAssetList();
  showPrice();
  $('order-done').hidden = false;
  $('order-done').textContent = `Pretend order placed: ${o.side === 'buy' ? 'bought' : 'sold'} ${PaperAccount.fmtQty(o.quantity)} ${c.unit} ` +
    `for ${dollars(o.amount)} at ${priceText(o.price)}. Pretend cash is now ${dollars(account.cash)}.` +
    (canSave ? '' : ' This browser does not allow saving, so it will be lost when you close the page.');
}

function closeReview() {
  pending = null;
  $('review').hidden = true;
  $('order-form').hidden = false;
}

function showOrderError(msg) {
  $('order-loading').hidden = true;
  $('order-error').hidden = false;
  $('order-error').textContent = msg;
  $('order-form').hidden = true;
  $('review').hidden = true;
  $('prices-meta').innerHTML = '<strong>Where prices come from:</strong> CoinGecko (crypto tokens) and Yahoo Finance (US funds).' +
    '<br><strong>Last updated:</strong> unknown, because the prices could not be loaded.';
}

async function startOrders() {
  try {
    market = await loadMarket();
  } catch (err) {
    showOrderError('Prices could not be loaded, so no pretend order can be placed. ' + err.message);
    return;
  }
  $('order-loading').hidden = true;
  showPricesMeta();
  if (!account) {
    $('order-error').hidden = false;
    $('order-error').textContent = 'Pretend orders are paused until your paper account can be read. Choose "Start over" above.';
    return;
  }
  $('order-form').hidden = false;
  fillAssetList();
  showPrice();
}

// ---------- Start ----------

(function start() {
  storage = storageArea();
  const result = storage ? PaperAccount.loadAccount(storage) : { account: PaperAccount.newAccount(), status: 'blocked' };
  if (result.status === 'damaged') { showDamaged(); }
  else {
    account = result.account;
    canSave = result.status !== 'blocked';
    if (result.status === 'new') save();
    showAccount();
  }

  const confirmBox = $('reset-confirm');
  const done = $('reset-done');
  $('reset-start').addEventListener('click', () => {
    confirmBox.hidden = false;
    done.hidden = true;
    $('reset-no').focus();
  });
  $('reset-no').addEventListener('click', () => {
    confirmBox.hidden = true;
    $('reset-start').focus();
  });
  $('reset-yes').addEventListener('click', () => {
    const r = storage ? PaperAccount.resetAccount(storage) : { account: PaperAccount.newAccount(), saved: false };
    account = r.account;
    canSave = r.saved;
    confirmBox.hidden = true;
    $('account-error').hidden = true;
    showAccount();
    done.hidden = false;
    done.textContent = 'Done. You have a new paper account with 100,000 pretend US dollars.';
    if (market) {
      $('order-error').hidden = true;
      $('order-done').hidden = true;
      closeReview();
      fillAssetList();
      showPrice();
    }
  });

  $('side-buy').addEventListener('change', onSideChange);
  $('side-sell').addEventListener('change', onSideChange);
  $('asset').addEventListener('change', () => { $('order-done').hidden = true; showPrice(); });
  $('amount').addEventListener('input', updateHint);
  $('sell-all').addEventListener('change', updateHint);
  $('order-form').addEventListener('submit', review);
  $('place-btn').addEventListener('click', place);
  $('change-btn').addEventListener('click', () => { closeReview(); $('amount').focus(); });

  startOrders();
})();

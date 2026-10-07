// Reads the data files in /data and fills the tables.
// The page never calls a data provider directly.

const NA = '<span class="na">not available</span>';
const FILE_HINT = 'If you opened index.html straight from your computer, your browser may block the data files. Open the web link instead.';

// ---------- Loading files ----------

async function loadJson(path) {
  let res;
  try {
    res = await fetch(path, { cache: 'no-store' });
  } catch (err) {
    throw new Error(path + ' could not be loaded. ' + FILE_HINT);
  }
  if (!res.ok) throw new Error(path + ' could not be loaded (the server answered ' + res.status + ').');
  try {
    return await res.json();
  } catch (err) {
    throw new Error(path + ' could not be read: the file is damaged or incomplete.');
  }
}

// ---------- Number and text formatting ----------

function isNum(v) { return typeof v === 'number' && isFinite(v); }

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Plain amount with a currency in front, for example "$56.10" or "CHF 22.77".
function money(v, ccy) {
  if (!isNum(v)) return NA;
  const digits = v >= 1 ? 2 : v >= 0.01 ? 4 : 6;
  const n = v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return !ccy || ccy === 'USD' ? '$' + n : esc(ccy) + ' ' + n;
}

// Big amounts in words, for example "$1.94 trillion".
function bigMoney(v, ccy) {
  if (!isNum(v)) return NA;
  if (v === 0) return !ccy || ccy === 'USD' ? '$0' : esc(ccy) + ' 0';
  const steps = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
  for (const [size, word] of steps) {
    if (v >= size) return (!ccy || ccy === 'USD' ? '$' : esc(ccy) + ' ') + (v / size).toFixed(2) + ' ' + word;
  }
  return money(v, ccy);
}

function count(v) { return isNum(v) ? v.toLocaleString('en-US') : NA; }
function percent(v) { return isNum(v) ? v.toFixed(2) + '%' : NA; }

function whenText(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return 'unknown';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

// Short time for under a price, for example "as of Oct 7, 07:58 PM UTC".
function asOf(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return '';
  const t = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  return `<span class="sub">as of ${esc(t)}</span>`;
}

function badge(cls, text) { return '<span class="badge ' + cls + '">' + esc(text) + '</span>'; }

// ---------- Source line, last updated and labels ----------

// Where each table's data comes from, shown even if the data file fails to load.
const SOURCES = {
  crypto: 'CoinGecko',
  funds: 'Yahoo Finance',
  tokf: 'CoinGecko',
};

function renderMeta(prefix, block, settings, opts) {
  opts = opts || {};
  const badges = [];
  if (block.sample) badges.push(badge('sample', 'Sample data'));
  badges.push(badge('info', opts.timing || 'Delayed 15 minutes'));
  const ageMin = (Date.now() - new Date(block.last_updated).getTime()) / 60000;
  // "May be old" applies to live data only, and not to stock market data while the market is closed.
  if (!block.sample && block.last_updated && !opts.marketClosed && !(ageMin <= settings.stale_after_minutes)) {
    badges.push(badge('warn', 'Data may be old'));
  }
  const failed = block.last_error && !(new Date(block.last_error.time) < new Date(block.last_updated));
  if (failed) badges.push(badge('warn', 'Latest refresh failed'));
  (opts.extra || []).forEach(b => badges.push(b));
  document.getElementById(prefix + '-badges').innerHTML = badges.join('');

  const src = block.source_url
    ? esc(block.source) + ' (<a href="' + esc(block.source_url) + '" target="_blank" rel="noopener">source site</a>)'
    : esc(block.source);
  document.getElementById(prefix + '-meta').innerHTML =
    '<strong>Where this comes from:</strong> ' + src +
    '<br><strong>Last updated:</strong> ' + (block.last_updated ? esc(whenText(block.last_updated)) : 'not yet') +
    (failed ? '<br><strong>Problem:</strong> the latest refresh at ' + esc(whenText(block.last_error.time)) +
      ' failed (' + esc(block.last_error.message) + '). Showing the last good data.' : '');
}

function showError(prefix, message) {
  document.getElementById(prefix + '-area').innerHTML = '<div class="error" role="alert">' + esc(message) + '</div>';
  document.getElementById(prefix + '-badges').innerHTML = badge('warn', 'Not loaded');
  document.getElementById(prefix + '-meta').innerHTML =
    '<strong>Where this comes from:</strong> ' + esc(SOURCES[prefix]) +
    '<br><strong>Last updated:</strong> unknown, because the data could not be loaded.';
  delete tables[prefix];
  updateSearchStatus();
}

// ---------- Tables: search, sorting, sideways scrolling ----------

const tables = {};
let query = '';

// columns: [{ key, label, num, value(row) for sorting, html(row), cls }]
// groups (optional): [{ label, test(row) }] keeps rows inside their group when sorting.
function makeTable(prefix, spec) {
  tables[prefix] = Object.assign({ sortKey: null, dir: 'desc' }, spec);
  drawTable(prefix);
}

function compare(spec, a, b) {
  const col = spec.columns.find(c => c.key === spec.sortKey);
  if (col.prefix) { // for example currency: CHF products, then EUR products
    const pa = col.prefix(a) || '', pb = col.prefix(b) || '';
    if (pa !== pb) return pa < pb ? -1 : 1;
  }
  const va = col.value(a), vb = col.value(b);
  const na = !isNum(va), nb = !isNum(vb);
  if (na || nb) return na === nb ? 0 : na ? 1 : -1; // "not available" always last
  return spec.dir === 'asc' ? va - vb : vb - va;
}

function drawTable(prefix) {
  const spec = tables[prefix];
  const area = document.getElementById(prefix + '-area');
  const match = r => !query || r.search.includes(query);

  const head = spec.columns.map(c => {
    const cls = (c.num ? 'num ' : '') + (c.first ? 'first' : '');
    if (!c.value) return `<th scope="col" class="${cls}">${esc(c.label)}</th>`;
    const active = spec.sortKey === c.key;
    const ariaSort = active ? (spec.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    const arrow = active ? (spec.dir === 'asc' ? '&#9650;' : '&#9660;') : '&#8693;';
    return `<th scope="col" class="${cls}" aria-sort="${ariaSort}"><button type="button" class="sort-btn${active ? ' active' : ''}" data-table="${prefix}" data-key="${c.key}">${esc(c.label)} <span class="arrow" aria-hidden="true">${arrow}</span></button></th>`;
  }).join('');

  const rowHtml = r => '<tr>' + spec.columns.map(c =>
    `<td class="${(c.num ? 'num ' : '') + (c.first ? 'first ' : '') + (c.cls || '')}">${c.html(r)}</td>`).join('') + '</tr>';

  const sorted = rows => spec.sortKey ? rows.slice().sort((a, b) => compare(spec, a, b)) : rows;

  let body = '', shown = 0;
  if (spec.groups) {
    spec.groups.forEach(g => {
      const rows = sorted(spec.rows.filter(r => g.test(r) && match(r)));
      if (!rows.length) return;
      shown += rows.length;
      body += `<tr class="group"><td class="first" colspan="${spec.columns.length}">${esc(g.label)}</td></tr>` + rows.map(rowHtml).join('');
    });
  } else {
    const rows = sorted(spec.rows.filter(match));
    shown = rows.length;
    body = rows.map(rowHtml).join('');
  }
  spec.shown = shown;

  area.innerHTML = `
    <div class="table-scroll" tabindex="0" role="region" aria-label="${esc(spec.label)} table, scrolls sideways">
      <table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>
    <p class="swipe-hint">Swipe sideways to see more columns.</p>
    ${shown ? '' : '<p class="no-match">No matches in this table.</p>'}`;
  area.querySelector('table').hidden = !shown;
  updateSearchStatus();
}

function updateSearchStatus() {
  const el = document.getElementById('search-status');
  if (!query) { el.textContent = ''; return; }
  const list = Object.values(tables);
  const shown = list.reduce((s, t) => s + (t.shown || 0), 0);
  const total = list.reduce((s, t) => s + t.rows.length, 0);
  el.textContent = shown
    ? `Showing ${shown} of ${total} rows that match "${query}".`
    : `No token or fund matches "${query}". Try a shorter word.`;
}

document.addEventListener('click', ev => {
  const btn = ev.target.closest('.sort-btn');
  if (!btn) return;
  const spec = tables[btn.dataset.table];
  if (!spec) return;
  if (spec.sortKey === btn.dataset.key) spec.dir = spec.dir === 'desc' ? 'asc' : 'desc';
  else { spec.sortKey = btn.dataset.key; spec.dir = 'desc'; } // first click: largest first
  drawTable(btn.dataset.table);
  const again = document.querySelector(`.sort-btn[data-table="${btn.dataset.table}"][data-key="${btn.dataset.key}"]`);
  if (again) again.focus();
});

document.getElementById('search').addEventListener('input', ev => {
  query = ev.target.value.trim().toLowerCase();
  Object.keys(tables).forEach(drawTable);
});

function startLoading() {
  ['crypto', 'funds', 'tokf'].forEach(p => {
    document.getElementById(p + '-area').innerHTML = '<p class="loading" role="status">Loading prices&hellip;</p>';
  });
}

// ---------- Pretend trade buttons (paper trading) ----------

// Opens the paper trading page with this token or US fund already chosen. Nothing is bought here.
function tradeCell(key, name) {
  return `<a class="trade-btn" href="paper.html?asset=${encodeURIComponent(key)}" aria-label="Pretend trade: ${esc(name)}">Pretend trade</a>`;
}

// ---------- Crypto table ----------

function nameCell(name, sub, extra) {
  return `<span class="name">${esc(name)}</span><span class="sub">${sub}${extra || ''}</span>`;
}

function loadCrypto(latest, settings) {
  const block = latest.crypto;
  if (!Array.isArray(block.rows) || block.rows.length === 0) throw new Error('The crypto data file has no tokens in it.');
  renderMeta('crypto', block, settings, {
    timing: block.sample ? 'Delayed 15 minutes' : 'Updated about every ' + settings.refresh_minutes + ' minutes',
  });
  makeTable('crypto', {
    label: 'Crypto tokens',
    sortKey: 'volume', dir: 'desc',
    rows: block.rows.map(r => Object.assign({ search: (r.name + ' ' + r.symbol).toLowerCase() }, r)),
    columns: [
      { key: 'name', label: 'Token', first: true, html: r => nameCell(r.name, esc(r.symbol), r.stablecoin ? '<span class="tag-stable">Stablecoin</span>' : '') },
      { key: 'price', label: 'Price (USD)', num: true, value: r => r.price_usd, html: r => money(r.price_usd) },
      { key: 'mv', label: 'Market value (USD)', num: true, value: r => r.market_value_usd, html: r => bigMoney(r.market_value_usd) },
      { key: 'volume', label: '24-hour volume (USD)', num: true, value: r => r.volume_24h_usd, html: r => bigMoney(r.volume_24h_usd) },
      { key: 'trade', label: 'Paper trading', cls: 'trade', html: r => tradeCell('token:' + r.id, r.name) },
    ],
  });
}

// ---------- Exchange-traded crypto funds: US and Europe in one table ----------

// A compact "as of" time for the fund table, for example "as of Oct 7, 19:54 UTC".
function asOfShort(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return '';
  const t = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
  return `<span class="sub">as of ${esc(t)}</span>`;
}

// The tokenized-funds file also holds the European products, so both tables share one load.
let tokenizedFiles = null;
function loadTokenizedFiles() {
  if (!tokenizedFiles) {
    tokenizedFiles = Promise.all([loadJson('data/tokenized-config.json'), loadJson('data/tokenized-latest.json')]);
  }
  return tokenizedFiles;
}

// Old or failed status of one part of the table, as short labels.
function partProblems(name, block, settings, marketClosed) {
  const labels = [], lines = [];
  if (!block || !block.last_updated) return { labels, lines };
  const ageMin = (Date.now() - new Date(block.last_updated).getTime()) / 60000;
  if (!marketClosed && !(ageMin <= settings.stale_after_minutes)) labels.push(badge('warn', name + ' data may be old'));
  const failed = block.last_error && !(new Date(block.last_error.time) < new Date(block.last_updated));
  if (failed) {
    labels.push(badge('warn', 'Latest ' + name + ' refresh failed'));
    lines.push('the latest ' + esc(name) + ' refresh at ' + esc(whenText(block.last_error.time)) + ' failed (' +
      esc(block.last_error.message) + '). Showing the last good data.');
  }
  return { labels, lines };
}

async function loadFunds(settings) {
  const [usR, euR] = await Promise.allSettled([
    Promise.all([loadJson('data/funds-config.json'), loadJson('data/funds-latest.json')]),
    loadTokenizedFiles(),
  ]);
  if (usR.status === 'rejected' && euR.status === 'rejected') throw new Error(usR.reason.message + ' ' + euR.reason.message);

  const rows = [];
  let us = null, eu = null;
  if (usR.status === 'fulfilled') {
    const [config, block] = usR.value;
    us = block;
    const byTicker = Object.fromEntries((block.rows || []).map(r => [r.ticker, r]));
    config.funds.forEach(f => {
      const d = byTicker[f.ticker] || {};
      rows.push({
        search: (f.name + ' ' + f.ticker + ' ' + f.type + ' usa united states').toLowerCase(),
        name: f.name, ticker: f.ticker, holds: f.type, country: 'USA', exchange: '',
        currency: 'USD', price: d.price_usd, priceTime: d.price_time, mv: d.total_assets_usd, volume: d.volume,
        fee: d.yearly_fee_pct, bid: d.bid, ask: d.ask, tradeKey: 'fund:' + f.ticker,
      });
    });
  }
  if (euR.status === 'fulfilled') {
    const [config, data] = euR.value;
    eu = data.exchange_traded;
    const by = Object.fromEntries((eu.rows || []).map(r => [r.ticker, r]));
    config.exchange_traded.forEach(p => {
      const d = by[p.ticker] || {};
      rows.push({
        search: (p.name + ' ' + p.ticker + ' ' + p.exchange + ' ' + p.country + ' ' + p.holds + ' europe').toLowerCase(),
        name: p.name, ticker: p.ticker, holds: p.holds, country: p.country, exchange: p.exchange.replace(/ Swiss Exchange| \(Germany\)/, ''),
        currency: d.currency, price: d.price, priceTime: d.price_time, mv: d.total_assets, volume: d.volume,
        fee: d.yearly_fee_pct, bid: d.bid, ask: d.ask, tradeKey: null,
      });
    });
  }

  // Badges and the "where from / last updated" lines, one for each part.
  const closed = !!us && us.market_status === 'closed';
  const usP = partProblems('US', us, settings, closed);
  const euP = partProblems('European', eu, settings, false);
  document.getElementById('funds-badges').innerHTML = [badge('info', 'Delayed 15 minutes or more')]
    .concat(closed ? [badge('info', 'US market closed: showing last close')] : [], usP.labels, euP.labels).join('');
  const problems = usP.lines.concat(euP.lines);
  if (usR.status === 'rejected') problems.push('US fund data could not be loaded. ' + esc(usR.reason.message));
  if (euR.status === 'rejected') problems.push('European product data could not be loaded. ' + esc(euR.reason.message));
  document.getElementById('funds-meta').innerHTML =
    '<strong>Where this comes from:</strong> Yahoo Finance (unofficial access through the yfinance library). ' +
    '(<a href="https://finance.yahoo.com/" target="_blank" rel="noopener">source site</a>)' +
    '<br><strong>Last updated:</strong> US funds ' + (us ? esc(us.last_updated ? whenText(us.last_updated) : 'not yet') : 'unknown') +
    '; European products ' + (eu ? esc(eu.last_updated ? whenText(eu.last_updated) : 'not yet') : 'unknown') + '.' +
    problems.map(p => '<br><strong>Problem:</strong> ' + p).join('');

  const types = ['Bitcoin', 'Ethereum', 'Zcash'];
  rows.forEach(r => { if (!types.includes(r.holds)) types.push(r.holds); });
  makeTable('funds', {
    label: 'Exchange-traded crypto funds',
    groups: types.map(t => ({ label: t + ' funds', test: r => r.holds === t })),
    rows,
    columns: [
      { key: 'name', label: 'Fund', first: true, html: r => nameCell(r.name, 'Ticker: ' + esc(r.ticker)) },
      { key: 'listed', label: 'Listed in', html: r => esc(r.country) + (r.exchange ? '<span class="sub">' + esc(r.exchange) + '</span>' : '') },
      // Sorting keeps each currency together (CHF, EUR, USD), so a franc price is never compared with a dollar price.
      { key: 'price', label: 'Price', num: true, prefix: r => r.currency, value: r => r.price, html: r => money(r.price, r.currency) + asOfShort(r.priceTime) },
      { key: 'mv', label: 'Market value', num: true, prefix: r => r.currency, value: r => r.mv, html: r => bigMoney(r.mv, r.currency) },
      { key: 'volume', label: 'Volume today', num: true, value: r => r.volume, html: r => count(r.volume) },
      { key: 'fee', label: 'Yearly fee', num: true, html: r => percent(r.fee) },
      { key: 'bidask', label: 'Bid / ask', num: true, html: r => isNum(r.bid) && isNum(r.ask) ? money(r.bid, r.currency) + '<span class="sub">to ' + money(r.ask, r.currency) + '</span>' : NA },
      { key: 'trade', label: 'Paper trading', cls: 'trade', html: r => r.tradeKey ? tradeCell(r.tradeKey, r.name) : '<span class="na">Not available for paper trading</span>' },
    ],
  });
}

// ---------- Tokenized funds ----------

function notFetchedYet(prefix, block) {
  if (block.last_updated) return false;
  document.getElementById(prefix + '-area').innerHTML =
    '<div class="error" role="alert">No data yet: the first data collection has not run. Check again in a few minutes.</div>';
  return true;
}

async function loadTokenized(settings) {
  const [config, data] = await loadTokenizedFiles();
  const tf = data.tokenized;
  renderMeta('tokf', tf, settings, { timing: 'Updated about every ' + settings.refresh_minutes + ' minutes' });
  if (notFetchedYet('tokf', tf)) return;
  const by = Object.fromEntries(tf.rows.map(r => [r.symbol, r]));
  makeTable('tokf', {
    label: 'Tokenized funds',
    rows: config.tokenized.map(p => Object.assign({ search: (p.name + ' ' + p.symbol + ' ' + p.issuer).toLowerCase() }, p, by[p.symbol] || {})),
    columns: [
      { key: 'name', label: 'Product', first: true, html: r => nameCell(r.name, esc(r.symbol) + ' &middot; ' + esc(r.issuer)) },
      { key: 'type', label: 'Type', html: () => 'Tokenized fund' },
      { key: 'tracks', label: 'What it tracks', cls: 'tracks', html: r => esc(r.tracks) },
      { key: 'price', label: 'Price (USD)', num: true, value: r => r.price_usd, html: r => money(r.price_usd) + asOf(r.price_time) },
      { key: 'mv', label: 'Market value (USD)', num: true, value: r => r.market_value_usd, html: r => bigMoney(r.market_value_usd) },
      { key: 'volume', label: '24-hour volume (USD)', num: true, value: r => r.volume_24h_usd, html: r => bigMoney(r.volume_24h_usd) },
      { key: 'bidask', label: 'Bid / ask', num: true, html: () => NA },
    ],
  });
}

// ---------- Start ----------

const AREAS = ['crypto', 'funds', 'tokf'];

(async function start() {
  startLoading();
  let settings;
  try {
    settings = await loadJson('data/settings.json');
  } catch (err) {
    AREAS.forEach(p => showError(p, 'This table could not be shown. ' + err.message));
    return;
  }
  // Each table loads its own files, so one failing does not blank the others.
  loadJson('data/latest.json').then(latest => loadCrypto(latest, settings))
    .catch(err => showError('crypto', 'This table could not be shown. ' + err.message));
  loadFunds(settings).catch(err => showError('funds', 'This table could not be shown. ' + err.message));
  loadTokenized(settings).catch(err => showError('tokf', 'This table could not be shown. ' + err.message));
})();

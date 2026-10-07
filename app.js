// Reads the data files in /data and fills the two tables.
// The page never calls a data provider directly.

const NA = '<span class="na">not available</span>';
const FILE_HINT = 'If you opened index.html straight from your computer, your browser may block the data files. Open the web link instead.';

async function loadJson(path) {
  try {
    return await fetchJson(path);
  } catch (err) {
    throw loadError(path, err);
  }
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(path + ' could not be loaded (status ' + res.status + ').');
  return res.json();
}

function loadError(path, err) {
  const e = new Error(path + ' could not be loaded. ' + FILE_HINT);
  e.cause = err;
  return e;
}

function isNum(v) { return typeof v === 'number' && isFinite(v); }

function usd(v, digits) {
  if (!isNum(v)) return NA;
  if (digits === undefined) digits = v >= 1 ? 2 : 4;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// Big amounts in words, for example "$1.94 trillion".
function bigUsd(v) {
  if (!isNum(v)) return NA;
  const steps = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
  for (const [size, word] of steps) {
    if (v >= size) return '$' + (v / size).toFixed(2) + ' ' + word;
  }
  return usd(v, 0);
}

function count(v) {
  if (!isNum(v)) return NA;
  return v.toLocaleString('en-US');
}

function percent(v) {
  if (!isNum(v)) return NA;
  return v.toFixed(2) + '%';
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function whenText(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return 'unknown';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

function badge(cls, text) { return '<span class="badge ' + cls + '">' + esc(text) + '</span>'; }

// Badges and the "source / last updated" line shared by both tables.
function renderMeta(prefix, block, settings, extraBadges, timingLabel, marketClosed) {
  const badges = [];
  if (block.sample) badges.push(badge('sample', 'Sample data'));
  badges.push(badge('info', timingLabel || 'Delayed 15 minutes'));
  // The data job could not refresh this table last time, so the numbers shown are older.
  const failed = block.last_error && !(new Date(block.last_error.time) < new Date(block.last_updated));
  if (failed) badges.push(badge('warn', 'Latest refresh failed'));
  const ageMin = (Date.now() - new Date(block.last_updated).getTime()) / 60000;
  // The "may be old" check only applies to live data while the market is open.
  // Sample data is always old by design, and fund data is not refreshed when the market is closed.
  if (!block.sample && block.last_updated && !marketClosed && !(ageMin <= settings.stale_after_minutes)) {
    badges.push(badge('warn', 'Data may be old'));
  }
  (extraBadges || []).forEach(b => badges.push(b));
  document.getElementById(prefix + '-badges').innerHTML = badges.join('');

  const src = block.source_url
    ? esc(block.source) + ' (<a href="' + esc(block.source_url) + '" target="_blank" rel="noopener">source site</a>)'
    : esc(block.source);
  document.getElementById(prefix + '-meta').innerHTML =
    '<strong>Where this comes from:</strong> ' + src + '<br><strong>Last updated:</strong> ' + (block.last_updated ? esc(whenText(block.last_updated)) : 'not yet') +
    (failed ? '<br><strong>Problem:</strong> the latest refresh at ' + esc(whenText(block.last_error.time)) +
      ' failed (' + esc(block.last_error.message) + '). Showing the last good data.' : '');
}

function showError(prefix, err) {
  const box = document.getElementById(prefix + '-error');
  box.hidden = false;
  box.textContent = 'This table could not be shown. ' + err.message;
  document.getElementById(prefix + '-table').hidden = true;
}

// ---------- Crypto table ----------

let cryptoRows = [];
let cryptoSort = 'volume_24h_usd';

function drawCrypto() {
  const rows = cryptoRows.slice().sort((a, b) => (b[cryptoSort] || 0) - (a[cryptoSort] || 0));
  document.querySelector('#crypto-table tbody').innerHTML = rows.map(r => `
    <tr>
      <td class="name">${esc(r.name)} <span class="sub">${esc(r.symbol)}${r.stablecoin ? '<span class="tag-stable">Stablecoin</span>' : ''}</span></td>
      <td class="num" data-label="Price (USD)">${usd(r.price_usd)}</td>
      <td class="num" data-label="Market value (USD)">${bigUsd(r.market_value_usd)}</td>
      <td class="num" data-label="24-hour volume (USD)">${bigUsd(r.volume_24h_usd)}</td>
    </tr>`).join('');
}

async function loadCrypto(latest, settings) {
  const block = latest.crypto;
  if (!Array.isArray(block.rows) || block.rows.length === 0) throw new Error('The crypto data file has no tokens in it.');
  cryptoRows = block.rows;
  const timing = block.sample ? 'Delayed 15 minutes' : 'Refreshed about every ' + settings.refresh_minutes + ' minutes';
  renderMeta('crypto', block, settings, [], timing);
  document.getElementById('crypto-title').textContent = 'Top ' + block.rows.length + ' crypto tokens by 24-hour trading volume';
  drawCrypto();

  document.querySelectorAll('.sort-bar button').forEach(btn => {
    btn.addEventListener('click', () => {
      cryptoSort = btn.dataset.sort;
      document.querySelectorAll('.sort-bar button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      drawCrypto();
    });
  });
}

// ---------- Fund table ----------

async function loadFunds(settings) {
  const [config, block] = await Promise.all([loadJson('data/funds-config.json'), loadJson('data/funds-latest.json')]);
  const byTicker = Object.fromEntries((block.rows || []).map(r => [r.ticker, r]));
  const groups = ['Bitcoin', 'Ethereum', 'Zcash'];
  // Any type not in the list above still shows, after the known groups.
  config.funds.forEach(f => { if (!groups.includes(f.type)) groups.push(f.type); });

  let html = '';
  groups.forEach(type => {
    const funds = config.funds.filter(f => f.type === type);
    if (!funds.length) return;
    html += `<tr class="group"><td colspan="7">${esc(type)} funds</td></tr>`;
    funds.forEach(f => {
      const d = byTicker[f.ticker] || {};
      html += `
        <tr>
          <td class="name">${esc(f.name)} <span class="sub">Ticker: ${esc(f.ticker)}</span></td>
          <td class="num" data-label="Price (USD)">${usd(d.price_usd)}</td>
          <td class="num" data-label="Market value (total assets)">${bigUsd(d.total_assets_usd)}</td>
          <td class="num" data-label="Volume today (shares)">${count(d.volume)}</td>
          <td class="num" data-label="Yearly fee">${percent(d.yearly_fee_pct)}</td>
          <td class="num" data-label="Bid">${usd(d.bid)}</td>
          <td class="num" data-label="Ask">${usd(d.ask)}</td>
        </tr>`;
    });
  });
  document.querySelector('#funds-table tbody').innerHTML = html;

  const closed = block.market_status === 'closed';
  const extra = [];
  if (closed) extra.push(badge('info', 'Market closed: showing last close'));
  renderMeta('funds', block, settings, extra, 'Delayed 15 minutes', closed);
}

// ---------- Tokenized funds and exchange-traded products ----------

function money(v, ccy) {
  if (!isNum(v)) return NA;
  const digits = v >= 1 ? 2 : 4;
  return esc(ccy || '') + ' ' + v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function bigMoney(v, ccy) {
  if (!isNum(v)) return NA;
  const steps = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
  for (const [size, word] of steps) if (v >= size) return esc(ccy || '') + ' ' + (v / size).toFixed(2) + ' ' + word;
  return money(v, ccy);
}

function asOf(iso) {
  return iso ? `<span class="sub">as of ${esc(whenText(iso))}</span>` : '';
}

// A part that has never been fetched shows a clear message instead of an empty table.
function notFetchedYet(prefix, block) {
  if (block.last_updated) return false;
  const box = document.getElementById(prefix + '-error');
  box.hidden = false;
  box.textContent = 'No data yet: the first fetch has not run. Check again in a few minutes.';
  document.getElementById(prefix + '-table').hidden = true;
  return true;
}

async function loadTokenized(settings) {
  const [config, data] = await Promise.all([loadJson('data/tokenized-config.json'), loadJson('data/tokenized-latest.json')]);

  const tf = data.tokenized;
  renderMeta('tokf', tf, settings, [], 'Refreshed about every ' + settings.refresh_minutes + ' minutes');
  if (!notFetchedYet('tokf', tf)) {
    const by = Object.fromEntries(tf.rows.map(r => [r.symbol, r]));
    document.querySelector('#tokf-table tbody').innerHTML = config.tokenized.map(p => {
      const d = by[p.symbol] || {};
      return `<tr>
        <td class="name">${esc(p.name)} <span class="sub">${esc(p.symbol)} &middot; ${esc(p.issuer)}</span></td>
        <td data-label="Type">Tokenized fund</td>
        <td data-label="What it tracks" class="tracks">${esc(p.tracks)}</td>
        <td class="num" data-label="Price (USD)">${usd(d.price_usd)}${asOf(d.price_time)}</td>
        <td class="num" data-label="Market value (USD)">${bigUsd(d.market_value_usd)}</td>
        <td class="num" data-label="24-hour volume (USD)">${isNum(d.volume_24h_usd) ? (d.volume_24h_usd === 0 ? '$0' : bigUsd(d.volume_24h_usd)) : NA}</td>
        <td class="num" data-label="Bid / ask">${NA}</td>
      </tr>`;
    }).join('');
  }

  const et = data.exchange_traded;
  renderMeta('etp', et, settings, [], 'Delayed 15 minutes or more');
  if (!notFetchedYet('etp', et)) {
    const by = Object.fromEntries(et.rows.map(r => [r.ticker, r]));
    document.querySelector('#etp-table tbody').innerHTML = config.exchange_traded.map(p => {
      const d = by[p.ticker] || {};
      const bidAsk = isNum(d.bid) && isNum(d.ask) ? `${money(d.bid, d.currency)} / ${money(d.ask, d.currency)}` : NA;
      return `<tr>
        <td class="name">${esc(p.name)} <span class="sub">${esc(p.ticker)} &middot; ${esc(p.exchange)}</span></td>
        <td data-label="Type">Exchange-traded product</td>
        <td data-label="What it tracks" class="tracks">${esc(p.tracks)}</td>
        <td class="num" data-label="Price">${money(d.price, d.currency)}${asOf(d.price_time)}</td>
        <td class="num" data-label="Market value">${bigMoney(d.total_assets, d.currency)}</td>
        <td class="num" data-label="Volume today (units)">${count(d.volume)}</td>
        <td class="num" data-label="Bid / ask">${bidAsk}</td>
      </tr>`;
    }).join('');
  }
}

// ---------- Start ----------

(async function start() {
  let settings;
  try {
    settings = await loadJson('data/settings.json');
  } catch (err) {
    ['crypto', 'funds', 'tokf', 'etp'].forEach(p => showError(p, err));
    return;
  }
  // Each table loads its own file, so one failing does not blank the other.
  loadJson('data/latest.json').then(latest => loadCrypto(latest, settings)).catch(err => showError('crypto', err));
  loadFunds(settings).catch(err => showError('funds', err));
  loadTokenized(settings).catch(err => { showError('tokf', err); showError('etp', err); });
})();

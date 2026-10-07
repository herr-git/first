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
function renderMeta(prefix, block, settings, extraBadges, timingLabel) {
  const badges = [];
  if (block.sample) badges.push(badge('sample', 'Sample data'));
  badges.push(badge('info', timingLabel || 'Delayed 15 minutes'));
  // The data job could not refresh this table last time, so the numbers shown are older.
  const failed = block.last_error && !(new Date(block.last_error.time) < new Date(block.last_updated));
  if (failed) badges.push(badge('warn', 'Latest refresh failed'));
  const ageMin = (Date.now() - new Date(block.last_updated).getTime()) / 60000;
  // The "may be old" check only applies to live data. Sample data is always old by design.
  if (!block.sample && !(ageMin <= settings.stale_after_minutes)) {
    badges.push(badge('warn', 'Data may be old'));
  }
  (extraBadges || []).forEach(b => badges.push(b));
  document.getElementById(prefix + '-badges').innerHTML = badges.join('');

  const src = block.source_url
    ? esc(block.source) + ' (<a href="' + esc(block.source_url) + '" target="_blank" rel="noopener">source site</a>)'
    : esc(block.source);
  document.getElementById(prefix + '-meta').innerHTML =
    '<strong>Where this comes from:</strong> ' + src + '<br><strong>Last updated:</strong> ' + esc(whenText(block.last_updated)) +
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

async function loadFunds(latest, settings) {
  const config = await loadJson('data/funds-config.json');
  const byTicker = Object.fromEntries(latest.funds.rows.map(r => [r.ticker, r]));
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
      const mv = isNum(d.price_usd) && isNum(f.shares_outstanding) ? d.price_usd * f.shares_outstanding : null;
      const mvNote = isNum(mv) && f.shares_as_of ? `<span class="sub">shares as of ${esc(f.shares_as_of)}</span>` : '';
      const feeNote = isNum(f.yearly_fee_pct) && f.fee_as_of ? `<span class="sub">as of ${esc(f.fee_as_of)}</span>` : '';
      html += `
        <tr>
          <td class="name">${esc(f.name)} <span class="sub">Ticker: ${esc(f.ticker)}</span></td>
          <td class="num" data-label="Price (USD)">${usd(d.price_usd)}</td>
          <td class="num" data-label="Market value (approx.)">${bigUsd(mv)}${mvNote}</td>
          <td class="num" data-label="Volume today (shares)">${count(d.volume)}</td>
          <td class="num" data-label="Yearly fee">${percent(f.yearly_fee_pct)}${feeNote}</td>
          <td class="num" data-label="Bid">${usd(d.bid)}</td>
          <td class="num" data-label="Ask">${usd(d.ask)}</td>
        </tr>`;
    });
  });
  document.querySelector('#funds-table tbody').innerHTML = html;

  const extra = [];
  if (latest.funds.market_status === 'closed') extra.push(badge('info', 'Market closed: showing last close'));
  if (config.sample && !latest.funds.sample) extra.push(badge('sample', 'Shares and fees: sample data'));
  renderMeta('funds', latest.funds, settings, extra);
}

// ---------- Light / Dark display ----------
// The choice is remembered in this browser only (localStorage). Nothing is sent anywhere.

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set === 'dark' || set === 'light') return set;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateThemeButton() {
  const btn = document.getElementById('theme-toggle');
  const dark = currentTheme() === 'dark';
  btn.textContent = dark ? 'Light display' : 'Dark display';
  btn.setAttribute('aria-label', dark ? 'Switch to light display' : 'Switch to dark display');
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked: choice lasts until the page closes */ }
  updateThemeButton();
});
updateThemeButton();

// ---------- Start ----------

(async function start() {
  let latest, settings;
  try {
    [latest, settings] = await Promise.all([loadJson('data/latest.json'), loadJson('data/settings.json')]);
  } catch (err) {
    showError('crypto', err);
    showError('funds', err);
    return;
  }
  loadCrypto(latest, settings).catch(err => showError('crypto', err));
  loadFunds(latest, settings).catch(err => showError('funds', err));
})();

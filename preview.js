// Version 2 preview: build a pretend mix and see a made-up 6-month result.
// All prices and exchange rates here are SAMPLE DATA generated below.

const START_USD = 10000;              // pretend starting amount
const DAYS = 182;                     // about 6 months of daily prices
const SAMPLE_RATES = { USD: 1, EUR: 0.92, GBP: 0.79 }; // sample, not real rates
const TOLERANCE = 0.1;                // 33.3 x 3 = 99.9 counts as 100

let assets = [];   // { key, label, kind: 'stable' | 'crypto' | 'fund' }
let mix = [];      // { key, pct }
let ccy = 'USD';
let lastResult = null;

// ---------- Sample prices ----------

// Small repeatable random generator, so the same asset always gets the same sample prices.
function seeded(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function sampleDates() {
  const out = [];
  const today = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1 - i));
    out.push(d);
  }
  return out;
}

// Every asset starts at 100 so no sample price looks like a real one.
function samplePrices(asset, dates) {
  const rnd = seeded(asset.key);
  const swing = asset.kind === 'stable' ? 0.0008 : asset.kind === 'fund' ? 0.022 : 0.04;
  const prices = [];
  let p = 100;
  dates.forEach((d, i) => {
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    if (i > 0 && !(asset.kind === 'fund' && weekend)) {
      // Funds keep the last close at weekends; everything else moves every day.
      p = p * (1 + (rnd() - 0.5) * 2 * swing);
      if (asset.kind === 'stable') p = 100 + (p - 100) * 0.5;
    }
    prices.push(p);
  });
  return prices;
}

// ---------- Result maths ----------

// Fixed mix: buy once on day 1, never adjust.
function computeResult(mixRows, priceMap, startValue) {
  const days = priceMap[mixRows[0].key].length;
  const totalPct = mixRows.reduce((s, r) => s + r.pct, 0);
  const units = mixRows.map(r => (startValue * (r.pct / totalPct)) / priceMap[r.key][0]);
  const values = [];
  for (let d = 0; d < days; d++) {
    values.push(mixRows.reduce((s, r, i) => s + units[i] * priceMap[r.key][d], 0));
  }
  let peak = values[0], peakIdx = 0, drop = 0, dropFrom = 0, dropTo = 0;
  values.forEach((v, i) => {
    if (v > peak) { peak = v; peakIdx = i; }
    const dd = (peak - v) / peak;
    if (dd > drop) { drop = dd; dropFrom = peakIdx; dropTo = i; }
  });
  return {
    values,
    start: values[0],
    end: values[days - 1],
    changePct: (values[days - 1] / values[0] - 1) * 100,
    dropPct: drop * 100,
    dropFrom,
    dropTo,
  };
}

// ---------- Formatting ----------

function money(usdValue) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy, maximumFractionDigits: 0 })
    .format(usdValue * SAMPLE_RATES[ccy]);
}
function signedPct(v) { return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'; }
function dayText(d) { return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }); }

// ---------- Automatic fill to 100% ----------

function round1(v) { return Math.round(v * 10) / 10; }

// Even split with one decimal; the last asset takes the rounding remainder (3 assets: 33.3, 33.3, 33.4).
function evenSplit(n) {
  if (n <= 0) return [];
  const each = round1(100 / n);
  const out = Array(n).fill(each);
  out[n - 1] = round1(100 - each * (n - 1));
  return out;
}

// The last asset fills whatever is left so the total is 100. It never goes below 0.
function balanceLast(pcts) {
  if (pcts.length < 2) return pcts.length ? [100] : [];
  const others = pcts.slice(0, -1).reduce((s, v) => s + (isFinite(v) ? v : 0), 0);
  return pcts.slice(0, -1).concat([Math.max(0, round1(100 - others))]);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---------- Mix builder ----------

function totalPct() { return mix.reduce((s, r) => s + (isFinite(r.pct) ? r.pct : 0), 0); }
function mixValid() {
  return mix.length > 0 && mix.every(r => isFinite(r.pct) && r.pct > 0) && Math.abs(totalPct() - 100) <= TOLERANCE + 1e-9; // tiny margin for computer rounding
}

function drawPicker() {
  const used = new Set(mix.map(r => r.key));
  const groups = [['crypto', 'Crypto tokens'], ['stable', 'Stablecoins'], ['fund', 'Crypto funds']];
  document.getElementById('asset-pick').innerHTML = groups.map(([kind, label]) => {
    const opts = assets.filter(a => a.kind === kind && !used.has(a.key))
      .map(a => `<option value="${esc(a.key)}">${esc(a.label)}</option>`).join('');
    return opts ? `<optgroup label="${label}">${opts}</optgroup>` : '';
  }).join('');
  document.getElementById('add-asset').disabled = !document.getElementById('asset-pick').value;
}

function drawMix() {
  const body = document.querySelector('#mix-table tbody');
  body.innerHTML = mix.map((r, i) => {
    const a = assets.find(x => x.key === r.key);
    return `<tr>
      <td>${esc(a.label)}${mix.length > 1 && i === mix.length - 1 ? '<span class="sub">Adjusts automatically to make 100%</span>' : ''}</td>
      <td class="num"><input type="number" inputmode="decimal" min="0" max="100" step="0.1" value="${isFinite(r.pct) ? r.pct : ''}" data-i="${i}" aria-label="Percentage for ${esc(a.label)}"> %</td>
      <td><button type="button" class="link" data-remove="${i}">Remove</button></td>
    </tr>`;
  }).join('');
  document.getElementById('mix-table').hidden = mix.length === 0;
  document.getElementById('mix-empty').hidden = mix.length > 0;
  drawTotal();
  drawPicker();
}

function drawTotal() {
  const t = totalPct();
  const el = document.getElementById('mix-total');
  const ok = mixValid();
  let msg = `Total: ${t.toFixed(1)}%`;
  if (mix.length === 0) msg = '';
  else if (t > 100 + TOLERANCE) msg += `. Lower one of the percentages by ${(t - 100).toFixed(1)}% to get back to 100%.`;
  else if (mix.some(r => !(r.pct > 0))) msg += '. Every asset needs a percentage above 0.';
  else if (ok && t !== 100) msg += ' (counts as 100%: small rounding).';
  else if (!ok && t < 100) msg += `. Add ${(100 - t).toFixed(1)}% more to reach 100%.`;
  else if (!ok) msg += `. Remove ${(t - 100).toFixed(1)}% to get back to 100%.`;
  else msg += '. Ready.';
  el.textContent = msg;
  el.className = 'total ' + (ok ? 'ok' : 'not-ok');
  document.getElementById('show-result').disabled = !ok;
}

// ---------- Result ----------

function showResult() {
  const dates = sampleDates();
  const priceMap = {};
  mix.forEach(r => { priceMap[r.key] = samplePrices(assets.find(a => a.key === r.key), dates); });
  lastResult = Object.assign(computeResult(mix, priceMap, START_USD), { dates });
  document.getElementById('result-panel').hidden = false;
  drawResult();
  document.getElementById('result-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function drawResult() {
  const r = lastResult;
  if (!r) return;
  const changeWord = r.changePct >= 0 ? 'up' : 'down';
  document.getElementById('stats').innerHTML = `
    <div class="stat"><span class="label">Start value</span><span class="value">${money(r.start)}</span><span class="sub">${dayText(r.dates[0])}</span></div>
    <div class="stat"><span class="label">End value</span><span class="value">${money(r.end)}</span><span class="sub">${dayText(r.dates[r.dates.length - 1])}</span></div>
    <div class="stat"><span class="label">Total change</span><span class="value">${signedPct(r.changePct)}</span><span class="sub">${changeWord} over 6 months</span></div>
    <div class="stat"><span class="label">Biggest drop</span><span class="value">${r.dropPct > 0 ? '-' + r.dropPct.toFixed(2) + '%' : 'none'}</span><span class="sub">${r.dropPct > 0 ? dayText(r.dates[r.dropFrom]) + ' to ' + dayText(r.dates[r.dropTo]) : 'no fall from a high point'}</span></div>`;
  document.getElementById('chart-title').textContent = `Value of the pretend portfolio, day by day (${ccy})`;
  drawChart(r);
  document.querySelector('#day-table tbody').innerHTML = r.values.map((v, i) =>
    `<tr><td>${dayText(r.dates[i])}</td><td class="num">${money(v)}</td></tr>`).join('');
}

// Single-series line chart with a hover readout.
function drawChart(r) {
  const box = document.getElementById('chart');
  // Draw at the real screen width so labels stay readable on a phone.
  const W = Math.max(280, Math.round(box.clientWidth || 720));
  const narrow = W < 500;
  const H = narrow ? 220 : 280, L = narrow ? 58 : 64, R = 12, T = 16, B = 32;
  const vals = r.values.map(v => v * SAMPLE_RATES[ccy]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.15 || hi * 0.01;
  lo -= pad; hi += pad;
  const x = i => L + (i / (vals.length - 1)) * (W - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const fmt = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(v);

  const ticks = [0, 1, 2, 3].map(k => lo + ((hi - lo) * k) / 3);
  const grid = ticks.map(t => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="axis" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('');
  const parts = narrow ? 2 : 5;
  const xIdx = Array.from({ length: parts + 1 }, (_, k) => Math.round((k * (vals.length - 1)) / parts));
  const xl = xIdx.map(i => `<text class="axis" x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === vals.length - 1 ? 'end' : 'middle'}">${dayText(r.dates[i])}</text>`).join('');
  const path = vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');

  box.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of the pretend portfolio value over 6 months, sample data">
      ${grid}${xl}
      <path class="line" d="${path}"/>
      <circle class="end-dot" cx="${x(vals.length - 1)}" cy="${y(vals[vals.length - 1])}" r="4"/>
      <g class="hover" visibility="hidden">
        <line class="cross" y1="${T}" y2="${H - B}"/>
        <circle class="hover-dot" r="5"/>
      </g>
      <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
    </svg>
    <div class="tip" hidden></div>`;

  const svg = box.querySelector('svg'), g = box.querySelector('.hover'), tip = box.querySelector('.tip');
  const move = ev => {
    const pt = svg.getBoundingClientRect();
    const sx = ((ev.clientX - pt.left) / pt.width) * W;
    const i = Math.max(0, Math.min(vals.length - 1, Math.round(((sx - L) / (W - L - R)) * (vals.length - 1))));
    g.setAttribute('visibility', 'visible');
    g.querySelector('.cross').setAttribute('x1', x(i));
    g.querySelector('.cross').setAttribute('x2', x(i));
    g.querySelector('.hover-dot').setAttribute('cx', x(i));
    g.querySelector('.hover-dot').setAttribute('cy', y(vals[i]));
    tip.hidden = false;
    tip.innerHTML = `<strong>${fmt(vals[i])}</strong><br>${dayText(r.dates[i])}`;
    const left = (x(i) / W) * pt.width;
    tip.style.left = Math.min(Math.max(left, 50), pt.width - 50) + 'px';
    tip.style.top = (y(vals[i]) / H) * pt.height - 8 + 'px';
  };
  const leave = () => { g.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  const hit = box.querySelector('.hit');
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', leave);
}

// ---------- Start ----------

async function loadAssets() {
  const get = p => fetch(p, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(p); return r.json(); });
  const [latest, funds] = await Promise.all([get('data/latest.json'), get('data/funds-config.json')]);
  const list = [];
  latest.crypto.rows.forEach(t => list.push({ key: 'token:' + t.id, label: `${t.name} (${t.symbol})`, kind: t.stablecoin ? 'stable' : 'crypto' }));
  funds.funds.forEach(f => list.push({ key: 'fund:' + f.ticker, label: `${f.name} (${f.ticker})`, kind: 'fund' }));
  return list;
}

(async function start() {
  if (typeof document === 'undefined') return; // running in the automated test
  document.getElementById('sample-date').textContent =
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  try {
    assets = await loadAssets();
  } catch (err) {
    const box = document.getElementById('load-error');
    box.hidden = false;
    box.textContent = 'The list of assets could not be loaded (' + err.message + '). If you opened this file straight from your computer, open the web link instead.';
    document.getElementById('add-asset').disabled = true;
    return;
  }
  drawMix();

  document.getElementById('add-asset').addEventListener('click', () => {
    const key = document.getElementById('asset-pick').value;
    if (!key) return;
    mix.push({ key, pct: NaN });
    evenSplit(mix.length).forEach((v, i) => { mix[i].pct = v; });
    drawMix();
    const inputs = document.querySelectorAll('#mix-table input');
    inputs[inputs.length - 1].focus();
  });
  document.querySelector('#mix-table tbody').addEventListener('input', ev => {
    if (!ev.target.matches('input')) return;
    const i = +ev.target.dataset.i;
    mix[i].pct = parseFloat(ev.target.value);
    if (i < mix.length - 1) {
      // Editing any row except the last: the last row fills the gap.
      const last = balanceLast(mix.map(r => r.pct)).pop();
      mix[mix.length - 1].pct = last;
      const lastInput = document.querySelector(`#mix-table input[data-i="${mix.length - 1}"]`);
      if (lastInput) lastInput.value = last;
    }
    drawTotal();
  });
  document.querySelector('#mix-table tbody').addEventListener('click', ev => {
    const i = ev.target.dataset.remove;
    if (i === undefined) return;
    mix.splice(+i, 1);
    balanceLast(mix.map(r => r.pct)).forEach((v, k) => { mix[k].pct = v; });
    drawMix();
  });
  document.getElementById('show-result').addEventListener('click', showResult);
  document.getElementById('ccy').addEventListener('change', ev => { ccy = ev.target.value; drawResult(); });
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawResult, 150); });
})();

// For the automated test.
if (typeof module !== 'undefined') module.exports = { computeResult, evenSplit, balanceLast };

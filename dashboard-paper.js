// Dashboard: a read-only summary of the visitor's paper account (saved in this browser).
// It never creates or changes the account; trading happens on paper.html.

async function paperSummary() {
  const area = document.getElementById('paper-area');
  const meta = document.getElementById('paper-meta');
  const loading = document.getElementById('paper-loading');
  const money = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const when = iso => {
    const d = new Date(iso);
    return !iso || isNaN(d) ? 'unknown' : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  };
  const signed = v => (v > 0 ? '+' : v < 0 ? '-' : '') + money(Math.abs(v));

  let storage = null;
  try { storage = window.localStorage; } catch (e) { /* blocked */ }
  const result = storage ? PaperAccount.loadAccount(storage) : { status: 'blocked' };

  if (result.status === 'new' || result.status === 'blocked') {
    loading.hidden = true;
    area.innerHTML = '<p class="empty">' + (result.status === 'new'
      ? 'You have not opened a paper account in this browser yet. It starts with 100,000 pretend US dollars.'
      : 'This browser does not allow saving, so a paper account cannot be shown here.') + '</p>';
    meta.innerHTML = '<strong>Where this comes from:</strong> the paper account saved in this browser.<br><strong>Last updated:</strong> no account yet.';
    return;
  }
  if (result.status === 'damaged') {
    loading.hidden = true;
    area.innerHTML = '<div class="error" role="alert">Your saved paper account could not be read. Open paper trading and choose "Start over".</div>';
    meta.innerHTML = '<strong>Where this comes from:</strong> the paper account saved in this browser.<br><strong>Last updated:</strong> unknown, because it could not be read.';
    return;
  }

  const account = result.account;
  let market = null;
  try { market = await loadMarket(); } catch (e) { /* valued at last known prices below */ }
  const now = new Date();
  const pf = PaperAccount.portfolio(account, key => (market ? priceFor(market, key, now) : null));
  const flagged = pf.rows.filter(r => r.status !== 'ok').length;
  loading.hidden = true;
  area.innerHTML =
    '<div class="stats">' +
    `<div class="stat"><span class="label">Total value</span><span class="value">${money(pf.total)}</span><span class="sub">pretend US dollars</span></div>` +
    `<div class="stat"><span class="label">Pretend cash</span><span class="value">${money(pf.cash)}</span><span class="sub">not invested</span></div>` +
    `<div class="stat"><span class="label">Holdings</span><span class="value">${money(pf.holdingsValue)}</span><span class="sub">${pf.rows.length} ${pf.rows.length === 1 ? 'holding' : 'holdings'}</span></div>` +
    `<div class="stat"><span class="label">Change since you started</span><span class="value ${pf.change > 0 ? 'up' : pf.change < 0 ? 'down' : ''}">${signed(pf.change)}</span><span class="sub">from $100,000.00</span></div>` +
    '</div>' +
    (flagged ? `<p class="note">${flagged} ${flagged === 1 ? 'holding uses a price' : 'holdings use prices'} that may be old or not updated. Details on the paper trading page.</p>` : '') +
    (market ? '' : '<div class="error" role="alert">Prices could not be loaded, so holdings are valued at the last price you traded at.</div>');
  meta.innerHTML = market
    ? '<strong>Where this comes from:</strong> your paper account saved in this browser, valued with CoinGecko (crypto) and Yahoo Finance (US funds) prices.' +
      '<br><strong>Last updated:</strong> account ' + when(account.updated) + '; prices: crypto ' + when(market.cryptoUpdated) + ', US funds ' + when(market.fundsUpdated) + '.'
    : '<strong>Where this comes from:</strong> your paper account saved in this browser.<br><strong>Last updated:</strong> account ' + when(account.updated) + '; current prices unknown.';
}

paperSummary();
// Another tab or window changed the paper account: show the latest version here too.
window.addEventListener('storage', ev => {
  if (ev.key === PaperAccount.STORAGE_KEY || ev.key === null) paperSummary();
});

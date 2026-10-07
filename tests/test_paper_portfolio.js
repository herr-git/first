// Known-answer tests for the portfolio view (run: node tests/test_paper_portfolio.js).
const assert = require('assert');
const P = require('../paper-account.js');
const T = new Date('2026-10-08T15:00:00Z');
const t = T.toISOString();

// Start 100,000. Buy $10,000 of Bitcoin at $80,000 (0.125 BTC) and $5,000 of IBIT at $50 (100 shares).
let a = P.newAccount(T);
a = P.buy(a, { key: 'token:bitcoin', name: 'Bitcoin (BTC)' }, 10000, 80000, t, T).account;
a = P.buy(a, { key: 'fund:IBIT', name: 'IBIT' }, 5000, 50, t, T).account;
assert.strictEqual(a.cash, 85000);

// Now Bitcoin is $88,000 (+10%) and IBIT is $45 (-10%).
const prices = { 'token:bitcoin': { price: 88000, priceTime: t, ok: true }, 'fund:IBIT': { price: 45, priceTime: t, ok: true } };
let pf = P.portfolio(a, k => prices[k] || null);
// Bitcoin: 0.125 x 88,000 = 11,000, paid 10,000, gain +1,000 (+10%).
// IBIT: 100 x 45 = 4,500, paid 5,000, gain -500 (-10%).
// Holdings 15,500; total 85,000 + 15,500 = 100,500; change +500 (+0.5%).
const btc = pf.rows.find(r => r.key === 'token:bitcoin');
const ibit = pf.rows.find(r => r.key === 'fund:IBIT');
assert.strictEqual(btc.value, 11000); assert.strictEqual(btc.gain, 1000); assert.strictEqual(btc.gainPct.toFixed(2), '10.00');
assert.strictEqual(ibit.value, 4500); assert.strictEqual(ibit.gain, -500); assert.strictEqual(ibit.gainPct.toFixed(2), '-10.00');
assert.strictEqual(pf.holdingsValue, 15500);
assert.strictEqual(pf.total, 100500);
assert.strictEqual(pf.change, 500);
assert.strictEqual(pf.changePct.toFixed(2), '0.50');
assert.deepStrictEqual(pf.rows.map(r => r.key), ['token:bitcoin', 'fund:IBIT'], 'largest holding first');
assert.ok(pf.rows.every(r => r.status === 'ok'));

// A price older than the limit is still used, but marked "old".
pf = P.portfolio(a, k => (k === 'fund:IBIT' ? { price: 45, priceTime: t, ok: false } : prices[k]));
assert.strictEqual(pf.rows.find(r => r.key === 'fund:IBIT').status, 'old');

// A token that left the top 20: valued at its last known price (the buy price, 80,000), marked "not-updated".
pf = P.portfolio(a, k => (k === 'token:bitcoin' ? null : prices[k]));
const gone = pf.rows.find(r => r.key === 'token:bitcoin');
assert.strictEqual(gone.status, 'not-updated');
assert.strictEqual(gone.price, 80000);
assert.strictEqual(gone.value, 10000);
assert.strictEqual(pf.total, 85000 + 10000 + 4500);

// Empty account: everything is cash.
pf = P.portfolio(P.newAccount(T), () => null);
assert.strictEqual(pf.total, 100000); assert.strictEqual(pf.change, 0); assert.strictEqual(pf.rows.length, 0);

// After selling part, the cost left is the average cost: sell $5,500 of BTC at $88,000 (0.0625 BTC, half).
a = P.sell(a, { key: 'token:bitcoin', name: 'Bitcoin (BTC)' }, 5500, 88000, t, T, false).account;
pf = P.portfolio(a, k => prices[k]);
const half = pf.rows.find(r => r.key === 'token:bitcoin');
assert.strictEqual(half.cost, 5000); assert.strictEqual(half.value, 5500); assert.strictEqual(half.gain, 500);
assert.strictEqual(pf.total, 100500, 'selling at the current price does not change the total');

console.log('All portfolio view tests passed.');

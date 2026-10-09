// Known-answer tests for pretend orders (run: node tests/test_paper_orders.js).
const assert = require('assert');
const P = require('../paper-account.js');

const T = new Date('2026-10-07T18:00:00Z'); // a Wednesday, 2:00 PM New York time (market open)
const btc = { key: 'token:bitcoin', name: 'Bitcoin (BTC)' };
const ibit = { key: 'fund:IBIT', name: 'iShares Bitcoin Trust ETF (IBIT)' };
let a = P.newAccount(T);

// Buy $1,000 of Bitcoin at $80,000: 0.0125 BTC, cash 99,000.
let r = P.buy(a, btc, 1000, 80000, T.toISOString(), T);
assert.ok(r.ok);
assert.strictEqual(r.order.quantity, 0.0125);
assert.strictEqual(r.account.cash, 99000);
assert.strictEqual(r.account.holdings['token:bitcoin'].cost, 1000);
assert.strictEqual(a.cash, 100000, 'the original account is not changed');
a = r.account;

// Fractions: $100 of a $47.15 fund share = 2.12089077 shares.
r = P.buy(a, ibit, 100, 47.15, T.toISOString(), T);
assert.strictEqual(r.order.quantity, 2.12089077);
assert.strictEqual(r.account.cash, 98900);
a = r.account;

// Cannot spend more than the cash.
r = P.buy(a, btc, 98900.01, 80000, T.toISOString(), T);
assert.strictEqual(r.ok, false);
assert.match(r.reason, /Not enough pretend cash/);
// Spending exactly all cash is fine.
assert.ok(P.buy(a, btc, 98900, 80000, T.toISOString(), T).ok);
// Zero, negative or empty amounts are refused.
['0', '-5', '', 'abc'].forEach(x => assert.strictEqual(P.buy(a, btc, x, 80000, T.toISOString(), T).ok, false));

// Sell $500 of Bitcoin at $100,000: 0.005 BTC sold, 0.0075 left, cost of what is left = 600.
r = P.sell(a, btc, 500, 100000, T.toISOString(), T, false);
assert.ok(r.ok);
assert.strictEqual(r.order.quantity, 0.005);
assert.strictEqual(r.account.cash, 99400);
assert.strictEqual(r.account.holdings['token:bitcoin'].quantity, 0.0075);
assert.strictEqual(r.account.holdings['token:bitcoin'].cost, 600);
a = r.account;

// Cannot sell more than owned (0.0075 BTC x $100,000 = $750).
r = P.sell(a, btc, 750.01, 100000, T.toISOString(), T, false);
assert.strictEqual(r.ok, false);
assert.match(r.reason, /You only own/);
// Sell all: everything, at the price, and the holding disappears.
r = P.sell(a, btc, null, 100000, T.toISOString(), T, true);
assert.ok(r.ok);
assert.strictEqual(r.order.amount, 750);
assert.strictEqual(r.account.cash, 100150);
assert.strictEqual(r.account.holdings['token:bitcoin'], undefined);
a = r.account;
// Cannot sell what you do not own.
assert.strictEqual(P.sell(a, btc, 10, 100000, T.toISOString(), T, false).ok, false);

// Orders are recorded in order, numbered.
assert.deepStrictEqual(a.orders.map(o => o.side + ':' + o.id), ['buy:1', 'buy:2', 'sell:3', 'sell:4']);
assert.ok(P.isValidAccount(a), 'the account is still valid after trading');

// Many small trades keep cash in whole cents.
let b = P.newAccount(T);
for (let i = 0; i < 30; i++) b = P.buy(b, btc, 33.33, 81234.56, T.toISOString(), T).account;
assert.strictEqual(b.cash, 99000.1);
assert.strictEqual(String(b.cash).split('.')[1].length <= 2, true);

// ---- Price age rules (limit 24 hours) ----
const at = mins => new Date(T.getTime() - mins * 60000).toISOString();
assert.strictEqual(P.checkPrice({ kind: 'crypto', price: 1, priceTime: at(10) }, T, 1440).ok, true);
assert.strictEqual(P.checkPrice({ kind: 'crypto', price: 1, priceTime: at(1440) }, T, 1440).ok, true);
let c = P.checkPrice({ kind: 'crypto', price: 1, priceTime: at(1441) }, T, 1440);
assert.strictEqual(c.ok, false);
assert.match(c.reason, /1 day old|24 hours old|25 hours old/);
assert.match(P.checkPrice({ kind: 'crypto', price: 1, priceTime: at(3000) }, T, 1440).reason, /2 days old/);
assert.strictEqual(P.checkPrice({ kind: 'crypto', price: null, priceTime: at(1) }, T, 1440).ok, false);
assert.strictEqual(P.checkPrice({ kind: 'crypto', price: 5, priceTime: null }, T, 1440).ok, false);
// Fund, market open: same limit.
assert.strictEqual(P.checkPrice({ kind: 'fund', price: 47, priceTime: at(1500) }, T, 1440).ok, false);
// Fund, market closed (Saturday): last price allowed, up to 4 days old.
const SAT = new Date('2026-10-10T15:00:00Z');
c = P.checkPrice({ kind: 'fund', price: 47, priceTime: '2026-10-09T19:59:00Z' }, SAT, 1440);
assert.strictEqual(c.ok, true);
assert.strictEqual(c.marketClosed, true);
assert.strictEqual(P.checkPrice({ kind: 'fund', price: 47, priceTime: '2026-10-01T19:59:00Z' }, SAT, 1440).ok, false);
// Market hours in New York time.
assert.strictEqual(P.usMarketOpen(new Date('2026-10-07T13:29:00Z')), false); // 9:29 AM
assert.strictEqual(P.usMarketOpen(new Date('2026-10-07T13:30:00Z')), true);  // 9:30 AM
assert.strictEqual(P.usMarketOpen(new Date('2026-10-07T19:59:00Z')), true);  // 3:59 PM
assert.strictEqual(P.usMarketOpen(new Date('2026-10-07T20:00:00Z')), false); // 4:00 PM
assert.strictEqual(P.usMarketOpen(new Date('2026-12-07T15:00:00Z')), true);  // winter time, 10:00 AM
assert.strictEqual(P.usMarketOpen(SAT), false);

console.log('All pretend order tests passed.');

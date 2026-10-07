// Tests for the paper account (run: node tests/test_paper_account.js).
const assert = require('assert');
const P = require('../paper-account.js');

// A pretend browser storage.
function fakeStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}
const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

// New visitor: 100,000 pretend dollars, nothing owned.
let s = fakeStorage();
let r = P.loadAccount(s);
assert.strictEqual(r.status, 'new');
assert.strictEqual(r.account.cash, 100000);
assert.deepStrictEqual(r.account.holdings, {});
assert.deepStrictEqual(r.account.orders, []);

// Saved and loaded again (same browser, later visit).
assert.strictEqual(P.saveAccount(s, r.account), true);
r = P.loadAccount(s);
assert.strictEqual(r.status, 'loaded');
assert.strictEqual(r.account.cash, 100000);

// A changed balance survives a reload.
r.account.cash = 12345.67;
P.saveAccount(s, r.account);
assert.strictEqual(P.loadAccount(s).account.cash, 12345.67);

// Start over: back to 100,000 and saved.
const reset = P.resetAccount(s);
assert.strictEqual(reset.saved, true);
assert.strictEqual(P.loadAccount(s).account.cash, 100000);

// Damaged data is reported and NOT overwritten.
s = fakeStorage({ 'paper-account': '{not json' });
r = P.loadAccount(s);
assert.strictEqual(r.status, 'damaged');
assert.strictEqual(s.data['paper-account'], '{not json');
s = fakeStorage({ 'paper-account': JSON.stringify({ version: 1, cash: -5, holdings: {}, orders: [] }) });
assert.strictEqual(P.loadAccount(s).status, 'damaged'); // negative cash is not a valid account

// Browser that blocks storage: a working account for this visit only, and saving reports failure.
r = P.loadAccount(blocked);
assert.strictEqual(r.status, 'blocked');
assert.strictEqual(r.account.cash, 100000);
assert.strictEqual(P.saveAccount(blocked, r.account), false);

// Nothing personal is stored: only these fields.
assert.deepStrictEqual(Object.keys(P.newAccount()).sort(), ['cash', 'created', 'holdings', 'orders', 'updated', 'version']);

console.log('All paper account tests passed.');

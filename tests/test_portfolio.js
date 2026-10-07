// Known-answer test for the pretend portfolio maths (run: node tests/test_portfolio.js).
//
// Worked by hand:
//   Start 10,000. Mix: 50% asset A, 50% asset B.
//   A prices: 100, 120, 90, 110  -> buy 5,000 / 100 = 50 units
//   B prices:  50,  50, 50,  50  -> buy 5,000 / 50  = 100 units
//   Day values: 10,000 / 11,000 / 9,500 / 10,500
//   Total change: 10,500 / 10,000 - 1 = +5.00%
//   Biggest drop: from 11,000 (day 2) to 9,500 (day 3) = 1,500 / 11,000 = 13.64%
const assert = require('assert');
const { computeResult, evenSplit, balanceLast } = require('../preview.js');

const prices = { A: [100, 120, 90, 110], B: [50, 50, 50, 50] };
const r = computeResult([{ key: 'A', pct: 50 }, { key: 'B', pct: 50 }], prices, 10000);
assert.deepStrictEqual(r.values.map(v => Math.round(v)), [10000, 11000, 9500, 10500]);
assert.strictEqual(r.changePct.toFixed(2), '5.00');
assert.strictEqual(r.dropPct.toFixed(2), '13.64');
assert.strictEqual(r.dropFrom, 1);
assert.strictEqual(r.dropTo, 2);

// Rounding: 33.3% three times is treated as an even three-way split.
const r2 = computeResult([{ key: 'A', pct: 33.3 }, { key: 'B', pct: 33.3 }, { key: 'C', pct: 33.3 }],
  { A: [10, 10], B: [10, 10], C: [10, 10] }, 9000);
assert.strictEqual(Math.round(r2.end), 9000);

// A month with only rises has no drop.
const r3 = computeResult([{ key: 'A', pct: 100 }], { A: [1, 2, 3] }, 100);
assert.strictEqual(r3.dropPct, 0);

// Automatic fill to 100%.
assert.deepStrictEqual(evenSplit(1), [100]);
assert.deepStrictEqual(evenSplit(2), [50, 50]);
assert.deepStrictEqual(evenSplit(3), [33.3, 33.3, 33.4]);
assert.strictEqual(evenSplit(6).reduce((a, b) => a + b, 0).toFixed(1), '100.0');
assert.deepStrictEqual(balanceLast([60, 33.3, 33.4]), [60, 33.3, 6.7]); // last fills the gap
assert.deepStrictEqual(balanceLast([80, 40, 10]), [80, 40, 0]);         // never below 0
assert.deepStrictEqual(balanceLast([20]), [100]);                       // one asset is always 100

console.log('All portfolio tests passed.');

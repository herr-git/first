// The paper (pretend) trading account.
// Saved in the visitor's own browser (localStorage) only. Nothing is sent anywhere,
// and no personal data is stored: just pretend cash, holdings and pretend orders.

const STARTING_CASH = 100000;          // pretend US dollars
const STORAGE_KEY = 'paper-account';   // one entry in this browser's storage
const ACCOUNT_VERSION = 1;

function newAccount(now) {
  const t = (now || new Date()).toISOString();
  return {
    version: ACCOUNT_VERSION,
    created: t,
    updated: t,
    cash: STARTING_CASH,
    holdings: {},  // key ("token:bitcoin" or "fund:IBIT") -> { quantity, cost, name }
    orders: [],    // list of pretend orders, oldest first
  };
}

// Check that saved data looks like an account before using it.
function isValidAccount(a) {
  return !!a && a.version === ACCOUNT_VERSION && typeof a.cash === 'number' && isFinite(a.cash) && a.cash >= 0 &&
    a.holdings && typeof a.holdings === 'object' && !Array.isArray(a.holdings) && Array.isArray(a.orders) &&
    Object.values(a.holdings).every(h => h && typeof h.quantity === 'number' && h.quantity > 0 && typeof h.cost === 'number');
}

// Returns { account, status } where status is:
//   'new'       nothing saved yet: a fresh account
//   'loaded'    saved account found
//   'damaged'   something is saved but cannot be read (it is NOT overwritten)
//   'blocked'   this browser does not allow saving
function loadAccount(storage) {
  let text;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch (e) {
    return { account: newAccount(), status: 'blocked' };
  }
  if (text === null || text === undefined) return { account: newAccount(), status: 'new' };
  try {
    const a = JSON.parse(text);
    if (isValidAccount(a)) return { account: a, status: 'loaded' };
  } catch (e) { /* fall through */ }
  return { account: null, status: 'damaged' };
}

// Returns true if saved, false if this browser refused.
function saveAccount(storage, account) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(account));
    return true;
  } catch (e) {
    return false;
  }
}

// Start over: a fresh account replaces whatever was saved.
function resetAccount(storage, now) {
  const a = newAccount(now);
  return { account: a, saved: saveAccount(storage, a) };
}

const PaperAccount = { STARTING_CASH, STORAGE_KEY, newAccount, isValidAccount, loadAccount, saveAccount, resetAccount };
if (typeof module !== 'undefined') module.exports = PaperAccount;

// Paper trading page, slice 2a: the pretend account balance, saved in this browser, and Start over.

let account = null;
let canSave = true;

function storageArea() {
  try { return window.localStorage; } catch (e) { return null; }
}

function dollars(v) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function when(iso) {
  const d = new Date(iso);
  return isNaN(d) ? 'unknown' : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

function show() {
  document.getElementById('account-loading').hidden = true;
  document.getElementById('account-body').hidden = false;
  document.getElementById('cash').textContent = dollars(account.cash);
  document.getElementById('account-meta').innerHTML =
    '<strong>Where this comes from:</strong> the starting balance of 100,000 pretend US dollars is set by this demo. No market prices are used on this screen yet.' +
    '<br><strong>Last updated:</strong> your paper account was last changed on ' + when(account.updated) + '.';
  document.getElementById('storage-note').textContent = canSave
    ? 'Saved in this browser only. If you clear your browser data, or use another device or browser, you start again with a new account.'
    : 'This browser does not allow saving, so your paper account will be lost when you close this page.';
  document.getElementById('storage-note').className = canSave ? 'note' : 'error';
}

function showDamaged() {
  document.getElementById('account-loading').hidden = true;
  const box = document.getElementById('account-error');
  box.hidden = false;
  box.textContent = 'Your saved paper account could not be read. It has not been changed. Choose "Start over" to begin again with 100,000 pretend US dollars.';
  document.getElementById('account-body').hidden = false;
  document.getElementById('cash').textContent = 'not available';
  document.getElementById('account-meta').innerHTML =
    '<strong>Where this comes from:</strong> the paper account saved in this browser.<br><strong>Last updated:</strong> unknown, because it could not be read.';
}

(function start() {
  const storage = storageArea();
  const result = storage ? PaperAccount.loadAccount(storage) : { account: PaperAccount.newAccount(), status: 'blocked' };
  if (result.status === 'damaged') { showDamaged(); }
  else {
    account = result.account;
    canSave = result.status !== 'blocked';
    if (result.status === 'new') canSave = PaperAccount.saveAccount(storage, account);
    show();
  }

  const confirmBox = document.getElementById('reset-confirm');
  const done = document.getElementById('reset-done');
  document.getElementById('reset-start').addEventListener('click', () => {
    confirmBox.hidden = false;
    done.hidden = true;
    document.getElementById('reset-no').focus();
  });
  document.getElementById('reset-no').addEventListener('click', () => {
    confirmBox.hidden = true;
    document.getElementById('reset-start').focus();
  });
  document.getElementById('reset-yes').addEventListener('click', () => {
    const r = storage ? PaperAccount.resetAccount(storage) : { account: PaperAccount.newAccount(), saved: false };
    account = r.account;
    canSave = r.saved;
    confirmBox.hidden = true;
    document.getElementById('account-error').hidden = true;
    show();
    done.hidden = false;
    done.textContent = 'Done. You have a new paper account with 100,000 pretend US dollars.';
  });
})();

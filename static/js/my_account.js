'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const phoneInput = document.getElementById('phoneInput');

  phoneInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') lookupAccount();
  });

  // Auto-focus
  phoneInput.focus();
});

async function lookupAccount() {
  const phone  = document.getElementById('phoneInput').value.trim();
  const errEl  = document.getElementById('lookupError');
  const btn    = document.getElementById('lookupBtn');

  errEl.style.display = 'none';

  if (!phone || phone.length < 10) {
    showError('Please enter a valid 10-digit mobile number.');
    return;
  }

  btn.textContent = 'Looking up…';
  btn.disabled    = true;

  try {
    const res  = await fetch(`/api/customers/lookup?phone=${encodeURIComponent(phone)}`);
    const data = await res.json();

    if (!res.ok) {
      showError(data.message || 'No account found for this number.');
      return;
    }

    renderAccount(data);
  } catch (e) {
    showError('Could not connect. Please try again.');
  } finally {
    btn.textContent = 'View Account →';
    btn.disabled    = false;
  }
}

function renderAccount(data) {
  // Profile
  const initials = data.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('profAvatar').textContent = initials;
  document.getElementById('profName').textContent   = data.name;
  document.getElementById('profPhone').textContent  = data.phone;

  // Balance
  const lb    = data.ledger_balance || 0;
  const wBal  = data.wallet_balance || 0;

  const lbEl  = document.getElementById('pubLedgerBal');
  const hint  = document.getElementById('pubLedgerHint');

  lbEl.textContent = `₹${fmt(Math.abs(lb))}`;

  if (lb > 0) {
    lbEl.className   = 'pub-bal-value amt-owe';
    hint.textContent = 'You owe this amount to the shop.';
  } else if (lb < 0) {
    lbEl.className   = 'pub-bal-value amt-credit';
    hint.textContent = 'The shop owes you this amount.';
  } else {
    lbEl.className   = 'pub-bal-value';
    hint.textContent = 'Your account is fully settled.';
  }

  document.getElementById('pubWalletBal').textContent = `₹${fmt(wBal)}`;

  // Transactions
  renderTxns(data.transactions || []);

  // Show account section
  document.getElementById('lookupSection').style.display  = 'none';
  document.getElementById('accountSection').style.display = 'block';
}

function renderTxns(txns) {
  const list = document.getElementById('txnList');
  list.innerHTML = '';

  if (!txns.length) {
    list.innerHTML = '<p class="txn-empty">No transactions yet.</p>';
    return;
  }

  txns.forEach(t => {
    const item = document.createElement('div');
    item.className = 'txn-item';

    const sign = t.amount < 0 ? '−' : '+';
    const cls  = t.amount < 0 ? 'amt-credit' : 'amt-owe';
    const icon = typeIcon(t.type);
    const ref  = buildPubRef(t);

    item.innerHTML = `
      <div class="txn-icon">${icon}</div>
      <div class="txn-details">
        <div class="txn-type">${t.type}</div>
        <div class="txn-date">${fmtDate(t.timestamp)}</div>
        ${ref ? `<div class="txn-ref">${ref}</div>` : ''}
      </div>
      <div class="txn-amount ${cls}">${sign}₹${fmt(Math.abs(t.amount))}</div>`;
    list.appendChild(item);
  });
}

function buildPubRef(t) {
  if (!t.reference_type || !t.reference_id) return '';
  if (t.reference_type === 'bill') {
    return `<a href="/invoice/${t.reference_id}" target="_blank" class="pub-ref-link">View Invoice #${t.reference_id}</a>`;
  }
  return `${t.reference_type} #${t.reference_id}`;
}

function typeIcon(type) {
  const map = { SALE: '🛒', PAYMENT: '💳', REFUND: '↩️', SETTLEMENT: '✅' };
  return map[type] || '📄';
}

function logout() {
  document.getElementById('lookupSection').style.display  = 'block';
  document.getElementById('accountSection').style.display = 'none';
  document.getElementById('phoneInput').value = '';
  document.getElementById('phoneInput').focus();
}

function showError(msg) {
  const el = document.getElementById('lookupError');
  el.textContent    = msg;
  el.style.display  = 'block';
}

function fmt(n)  { return parseFloat(n || 0).toFixed(2); }
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}
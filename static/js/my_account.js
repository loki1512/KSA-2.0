'use strict';

document.addEventListener('DOMContentLoaded', loadAccount);

async function loadAccount() {
  try {
    const res = await fetch('/api/my-account');
    const data = await res.json();
    if (!res.ok) {
      showError(data.message || 'Could not load your account.');
      return;
    }
    renderAccount(data);
  } catch {
    showError('Could not connect. Please try again.');
  }
}

function renderAccount(data) {
  const initials = data.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('profAvatar').textContent = initials;
  document.getElementById('profName').textContent = data.name;
  document.getElementById('profPhone').textContent = data.phone || '';
  document.getElementById('profEmail').textContent = data.email || '';

  const lb = data.ledger_balance || 0;
  const wBal = data.wallet_balance || 0;
  const lbEl = document.getElementById('pubLedgerBal');
  const hint = document.getElementById('pubLedgerHint');

  lbEl.textContent = `Rs.${fmt(Math.abs(lb))}`;

  if (lb > 0) {
    lbEl.className = 'pub-bal-value amt-owe';
    hint.textContent = 'You owe this amount to the shop.';
  } else if (lb < 0) {
    lbEl.className = 'pub-bal-value amt-credit';
    hint.textContent = 'The shop owes you this amount.';
  } else {
    lbEl.className = 'pub-bal-value';
    hint.textContent = 'Your account is fully settled.';
  }

  document.getElementById('pubWalletBal').textContent = `Rs.${fmt(wBal)}`;
  renderTxns(data.transactions || []);
  document.getElementById('loadingSection').style.display = 'none';
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

    const sign = t.amount < 0 ? '-' : '+';
    const cls = t.amount < 0 ? 'amt-credit' : 'amt-owe';
    const ref = buildPubRef(t);

    item.innerHTML = `
      <div class="txn-details">
        <div class="txn-type">${esc(t.type)}</div>
        <div class="txn-date">${fmtDate(t.timestamp)}</div>
        ${ref ? `<div class="txn-ref">${ref}</div>` : ''}
      </div>
      <div class="txn-amount ${cls}">${sign}Rs.${fmt(Math.abs(t.amount))}</div>`;
    list.appendChild(item);
  });
}

function buildPubRef(t) {
  if (!t.reference_type || !t.reference_id) return '';
  if (t.reference_type === 'bill') {
    return `<a href="/invoice/${t.reference_id}" target="_blank" class="pub-ref-link">View Invoice #${t.reference_id}</a>`;
  }
  return `${esc(t.reference_type)} #${esc(t.reference_id)}`;
}

function showError(msg) {
  const el = document.getElementById('lookupError');
  el.textContent = msg;
  el.style.display = 'block';
}

function fmt(n) {
  return parseFloat(n || 0).toFixed(2);
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

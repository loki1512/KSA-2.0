'use strict';

// Extract customer ID from URL: /customers/42/ledger
const CUSTOMER_ID = parseInt(location.pathname.split('/')[2]);

let customerData = null;
let editReferrerSearchDebounce = null;
let selectedEditReferrer = null;
let editReferrerDirty = false;
let editReferrerCleared = false;
let editVillageSearchDebounce = null;

// ─── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadLedger();
  setupEditVillageSearch();
  setupEditReferrerSearch();
  setupModalKeyboard();
});

// ─── LOAD LEDGER ──────────────────────────────────────
async function loadLedger() {
  try {
    const [ledgerRes, customerRes, billsRes] = await Promise.all([
      fetch(`/api/ledgers/${CUSTOMER_ID}`),
      fetch(`/api/customers/${CUSTOMER_ID}`),
      fetch(`/api/customers/${CUSTOMER_ID}/bills`)
    ]);

    const ledger    = await ledgerRes.json();
    customerData    = await customerRes.json();
    const billsData = await billsRes.json();

    ledgerSnapshot = ledger;   // save for print

    renderProfile(customerData);
    renderKPIs(ledger, billsData);
    renderTransactions(ledger.transactions);
    renderBills(billsData);

    document.getElementById('loadingState').style.display  = 'none';
    document.getElementById('mainContent').style.display   = 'block';

  } catch (e) {
    document.getElementById('loadingState').textContent = 'Failed to load customer data.';
    console.error(e);
  }
}

// ─── RENDER PROFILE ───────────────────────────────────
function renderProfile(c) {
  document.getElementById('pageTitle').textContent = `${c.name} — Ledger`;
  document.title = `${c.name} | KSA`;

  const initials = c.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('profileAvatar').textContent = initials;
  document.getElementById('profileName').textContent   = c.name;
  document.getElementById('profilePhone').textContent  = c.phone || 'No phone';
  document.getElementById('profileReferral').textContent = c.referral_code || 'No referral code';
  document.getElementById('email').textContent = c.email || 'No email';

  if (c.village) document.getElementById('profileVillage').textContent = c.village;
  else document.getElementById('profileVillage').style.display = 'none';

  const typeEl = document.getElementById('profileType');
  typeEl.textContent = c.customer_type || 'regular';
  typeEl.className   = `type-badge type-${(c.customer_type || 'regular').toLowerCase()}`;

  if (c.address) document.getElementById('profileAddress').textContent = c.address;
  if (c.referred_by) {
    document.getElementById('profileReferral').textContent = `Referred by: ${c.referred_by}`;
    document.getElementById('profileReferral').style.fontWeight = '600';
  } else {
    document.getElementById('profileReferral').textContent = 'No referrer';
    document.getElementById('profileReferral').style.color = '#888';
  }

  document.getElementById('newBillBtn').href = `/billing?customer_id=${c.id}`;
}

// ─── RENDER KPIs ──────────────────────────────────────
function renderKPIs(ledger, bills) {
  // FIX: use ledger_balance for outstanding, wallet_balance for wallet
  const ledgerBal = -1*ledger.wallet_balance || 0;
  const walletBal = ledger.wallet_balance || 0;

  const balEl = document.getElementById('ledgerBalance');
  balEl.textContent = `₹${fmt(Math.abs(ledgerBal))}`;
  balEl.className   = `bal-value ${ledgerBal > 0 ? 'amt-debit' : ledgerBal < 0 ? 'amt-credit' : ''}`;

  document.getElementById('walletBalance').textContent = `₹${fmt(walletBal)}`;
  document.getElementById('totalBills').textContent    = bills.length;
}

// ─── RENDER TRANSACTIONS ──────────────────────────────
function formatReferrerDisplay(c) {
  return [c?.name, c?.phone, c?.village].filter(Boolean).join(' - ');
}

function setEditReferrerHint(message) {
  document.getElementById('editReferredByName').textContent = message;
}

function hideEditReferrerSuggestions() {
  const cont = document.getElementById('editReferrerSuggestions');
  if (cont) cont.style.display = 'none';
}

function renderEditReferrerSuggestions(customers) {
  const list = document.getElementById('editReferrerSuggestionList');
  const cont = document.getElementById('editReferrerSuggestions');
  if (!list || !cont) return;

  list.innerHTML = '';

  const matches = customers.filter(c => c.id !== CUSTOMER_ID);
  if (!matches.length) {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.style.color = 'var(--text-muted)';
    div.style.pointerEvents = 'none';
    div.textContent = 'No customers found';
    list.appendChild(div);
    cont.style.display = 'block';
    return;
  }

  matches.forEach(c => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.innerHTML = `
      <span class="suggestion-name">${esc(formatReferrerDisplay(c) || c.name || 'Unknown customer')}</span>
      <span class="suggestion-meta">${c.referral_code ? `Code: ${esc(c.referral_code)}` : ''}</span>`;
    div.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectEditReferrer(c);
    });
    list.appendChild(div);
  });

  cont.style.display = 'block';
}

async function fetchEditReferrerSuggestions(q) {
  try {
    const res = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data = await res.json();
    renderEditReferrerSuggestions(data);
  } catch (e) {
    console.error('Edit referrer search error', e);
  }
}

function selectEditReferrer(c) {
  selectedEditReferrer = c;
  editReferrerDirty = true;
  editReferrerCleared = false;
  document.getElementById('editReferredBy').value = formatReferrerDisplay(c) || c.name || '';
  setEditReferrerHint(`Selected: ${formatReferrerDisplay(c) || c.name}${c.referral_code ? ` (Code: ${c.referral_code})` : ''}`);
  hideEditReferrerSuggestions();
}

function setupEditReferrerSearch() {
  const input = document.getElementById('editReferredBy');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(editReferrerSearchDebounce);
    selectedEditReferrer = null;
    editReferrerCleared = false;

    const q = input.value.trim();
    if (!q) {
      editReferrerDirty = false;
      hideEditReferrerSuggestions();
      setEditReferrerHint(customerData?.referred_by ? `Current: ${customerData.referred_by}` : 'No referrer');
      return;
    }

    editReferrerDirty = true;
    setEditReferrerHint('Choose a referrer from the suggestions below.');
    editReferrerSearchDebounce = setTimeout(() => fetchEditReferrerSuggestions(q), 250);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideEditReferrerSuggestions();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#editReferrerSearchWrap')) hideEditReferrerSuggestions();
  });
}

function hideEditVillageSuggestions() {
  const cont = document.getElementById('editVillageSuggestions');
  if (cont) cont.style.display = 'none';
}

function renderEditVillageSuggestions(villages) {
  const list = document.getElementById('editVillageSuggestionList');
  const cont = document.getElementById('editVillageSuggestions');
  if (!list || !cont) return;

  list.innerHTML = '';

  if (!villages.length) {
    cont.style.display = 'none';
    return;
  }

  villages.forEach(village => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.innerHTML = `
      <span class="suggestion-name">${esc(village)}</span>
      <span class="suggestion-meta">Existing village</span>`;
    div.addEventListener('mousedown', (e) => {
      e.preventDefault();
      document.getElementById('editVillage').value = village;
      hideEditVillageSuggestions();
    });
    list.appendChild(div);
  });

  cont.style.display = 'block';
}

async function fetchEditVillageSuggestions(q) {
  try {
    const res = await fetch(`/api/customers/villages?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data = await res.json();
    renderEditVillageSuggestions(data);
  } catch (e) {
    console.error('Edit village search error', e);
  }
}

function setupEditVillageSearch() {
  const input = document.getElementById('editVillage');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(editVillageSearchDebounce);
    const q = input.value.trim();
    if (!q) {
      hideEditVillageSuggestions();
      return;
    }
    editVillageSearchDebounce = setTimeout(() => fetchEditVillageSuggestions(q), 250);
  });

  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q) fetchEditVillageSuggestions(q);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideEditVillageSuggestions();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#editVillageWrap')) hideEditVillageSuggestions();
  });
}

function renderTransactions(transactions) {
  const tbody = document.getElementById('txnBody');
  tbody.innerHTML = '';

  if (!transactions || !transactions.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">No transactions yet</td></tr>`;
    return;
  }

  transactions.forEach(t => {
    const tr   = document.createElement('tr');
    const sign = t.amount < 0 ? '−' : '+';
    const cls  = t.amount < 0 ? 'amt-credit' : 'amt-debit';
    const ref  = buildRefLink(t);

    tr.innerHTML = `
      <td class="date-cell">${fmtDate(t.timestamp)}</td>
      <td><span class="type-badge type-${t.type.toLowerCase()}">${t.type}</span></td>
      <td class="muted" style="font-size:12px;">${esc(t.notes || '—')}</td>
      <td class="num ${cls}">${sign}₹${fmt(Math.abs(t.amount))}</td>
      <td>${ref}</td>`;
    tbody.appendChild(tr);
  });
}

// ─── RENDER BILLS ─────────────────────────────────────
function renderBills(bills) {
  const tbody = document.getElementById('billsBody');
  tbody.innerHTML = '';

  if (!bills.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty">No bills yet</td></tr>`;
    return;
  }

  bills.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono" style="color:var(--accent);">#${b.id}</td>
      <td class="date-cell">${fmtDate(b.timestamp)}</td>
      <td class="num amt-debit">₹${fmt(b.final_amount)}</td>
      <td><a href="/bills/${b.id}" class="ref-link">View</a></td>`;
    tbody.appendChild(tr);
  });
}

function toggleBillsPanel() {
  const panel = document.getElementById('billsPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// ─── NEW RETURN ──────────────────────────────────────
function new_return(){
  location.href = `/returns/new?customer_id=${CUSTOMER_ID}`;
}

// ─── PAYMENT MODAL ────────────────────────────────────
function openPaymentModal() {
  document.getElementById('payAmount').value = '';
  document.getElementById('payNotes').value  = '';
  document.getElementById('paymentModal').style.display = 'flex';
  document.getElementById('payAmount').focus();
}

function closePaymentModal() {
  document.getElementById('paymentModal').style.display = 'none';
}

async function submitPayment() {
  const amount = parseFloat(document.getElementById('payAmount').value);
  const method = document.getElementById('payMethod').value;
  const notes  = document.getElementById('payNotes').value.trim();

  if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: CUSTOMER_ID, amount, method, notes })
    });

    if (!res.ok) throw new Error();
    closePaymentModal();
    showToast('Payment recorded', 'success');
    loadLedger();
  } catch {
    showToast('Failed to record payment', 'error');
  }
}

// ─── SETTLE MODAL ─────────────────────────────────────
function openSettleModal() {
  if (!customerData) return;
  // FIX: use raw snapshot data instead of parsing DOM text
  const balance = ledgerSnapshot ? (ledgerSnapshot.ledger_balance || 0) : 0;
  document.getElementById('settleCustomerName').textContent = customerData.name;
  document.getElementById('settleBalance').textContent      = `₹${fmt(Math.abs(balance))}`;
  document.getElementById('settleModal').style.display = 'flex';
}

function closeSettleModal() {
  document.getElementById('settleModal').style.display = 'none';
}

async function submitSettle() {
  try {
    const res = await fetch(`/api/ledgers/${CUSTOMER_ID}/settle`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { showToast(data.message || 'Settle failed', 'error'); return; }
    closeSettleModal();
    showToast(data.message, 'success');
    loadLedger();
  } catch {
    showToast('Request failed', 'error');
  }
}

// ─── EDIT CUSTOMER MODAL (FULL CRUD) ──────────────────
function openEditCustomer() {
  if (!customerData) return;
  document.getElementById('editName').value    = customerData.name    || '';
  document.getElementById('editPhone').value   = customerData.phone   || '';
  document.getElementById('editEmail').value   = customerData.email   || '';
  document.getElementById('editVillage').value = customerData.village || '';
  document.getElementById('editAddress').value = customerData.address || '';
  document.getElementById('editType').value    = customerData.customer_type || 'regular';
  document.getElementById('editReferralCode').value = customerData.referral_code || '';
  selectedEditReferrer = null;
  editReferrerDirty = false;
  editReferrerCleared = false;
  hideEditVillageSuggestions();
  hideEditReferrerSuggestions();
  document.getElementById('editReferredBy').value = '';
  setEditReferrerHint(customerData.referred_by ? `Current: ${customerData.referred_by}` : 'No referrer');
  document.getElementById('editPassword').value        = '';
  document.getElementById('editPasswordConfirm').value = '';
  document.getElementById('editCustomerModal').style.display = 'flex';
  document.getElementById('editName').focus();
}

function clearReferrer() {
  selectedEditReferrer = null;
  editReferrerDirty = true;
  editReferrerCleared = true;
  document.getElementById('editReferredBy').value = '';
  hideEditReferrerSuggestions();
  setEditReferrerHint('Referrer will be cleared');
}

function closeEditCustomer() {
  hideEditVillageSuggestions();
  hideEditReferrerSuggestions();
  document.getElementById('editCustomerModal').style.display = 'none';
}

async function submitEditCustomer() {
  const name     = document.getElementById('editName').value.trim();
  const phone    = document.getElementById('editPhone').value.trim();
  const email    = document.getElementById('editEmail').value.trim();
  const village  = document.getElementById('editVillage').value.trim();
  const address  = document.getElementById('editAddress').value.trim();
  const type     = document.getElementById('editType').value;
  const refCode  = document.getElementById('editReferralCode').value.trim();
  const referredByQuery = document.getElementById('editReferredBy').value.trim();
  const password = document.getElementById('editPassword').value;
  const confirm  = document.getElementById('editPasswordConfirm').value;

  if (!name) { showToast('Name is required', 'error'); return; }
  if (password && password !== confirm) {
    showToast('Passwords do not match', 'error');
    return;
  }
  if (password && password.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }
  if (referredByQuery && !selectedEditReferrer && !editReferrerCleared) {
    showToast('Choose a referrer from the suggestions or clear the field', 'error');
    return;
  }

  const payload = { name, phone, email, village, address, customer_type: type, referral_code: refCode };
  if (password) payload.password = password;

  try {
    // First update basic customer info
    const res = await fetch(`/api/customers/${CUSTOMER_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.message || 'Update failed', 'error');
      return;
    }

    if (editReferrerDirty) {
      const referredByCode = editReferrerCleared ? '' : (selectedEditReferrer?.referral_code || '');
      const referrerRes = await fetch(`/api/customers/${CUSTOMER_ID}/referrer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referral_code: referredByCode })
      });

      if (!referrerRes.ok) {
        const err = await referrerRes.json().catch(() => ({}));
        showToast(err.message || 'Referrer update failed', 'error');
        return;
      }
    }

    closeEditCustomer();
    showToast('Customer updated', 'success');
    loadLedger();
  } catch {
    showToast('Update failed', 'error');
  }
}

// ─── DELETE CUSTOMER ──────────────────────────────────
function openDeleteModal() {
  if (!customerData) return;
  document.getElementById('deleteCustomerName').textContent = customerData.name;
  document.getElementById('deleteConfirmInput').value = '';
  document.getElementById('deleteCustomerModal').style.display = 'flex';
  document.getElementById('deleteConfirmInput').focus();
}

function closeDeleteModal() {
  document.getElementById('deleteCustomerModal').style.display = 'none';
}

async function submitDeleteCustomer() {
  const typed = document.getElementById('deleteConfirmInput').value.trim();
  if (typed !== customerData.name) {
    showToast('Name does not match', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/ledgers/${CUSTOMER_ID}/customer`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    showToast('Customer deleted', 'success');
    setTimeout(() => { location.href = '/customers'; }, 1000);
  } catch {
    showToast('Delete failed', 'error');
  }
}

// ─── PRINT LEDGER ─────────────────────────────────────
let currentPrintMode = 'a4';   // 'a4' | 'thermal'
let ledgerSnapshot   = null;   // saved from last loadLedger call

function openPrintModal() {
  document.getElementById('printModal').style.display = 'flex';
}

function closePrintModal() {
  document.getElementById('printModal').style.display = 'none';
}

function printLedger(mode) {
  closePrintModal();
  currentPrintMode = mode;
  buildPrintArea();
  document.body.classList.remove('print-a4', 'print-thermal');
  document.body.classList.add(`print-${mode}`);
  window.print();
}

// FIX: reset print area and body class after printing
window.addEventListener('afterprint', () => {
  document.getElementById('ledgerPrintArea').style.display = 'none';
  document.body.classList.remove('print-a4', 'print-thermal');
});

function buildPrintArea() {
  if (!customerData || !ledgerSnapshot) return;

  const now = new Date();
  const dateStr = now.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  document.getElementById('lpPrintDate').textContent  = dateStr;
  document.getElementById('lpFooterDate').textContent = dateStr;

  const c = customerData;
  document.getElementById('lpCustomer').innerHTML = `
    <div class="lp-cust-name">${esc(c.name)}</div>
    ${c.phone    ? `<div class="lp-cust-meta">${esc(c.phone)}</div>` : ''}
    ${c.village  ? `<div class="lp-cust-meta">${esc(c.village)}</div>` : ''}
    ${c.address  ? `<div class="lp-cust-meta">${esc(c.address)}</div>` : ''}
    ${c.referral_code ? `<div class="lp-cust-meta">Referral: ${esc(c.referral_code)}</div>` : ''}
  `;

  // FIX: use ledger_balance (not wallet_balance) for outstanding
  const balance = ledgerSnapshot.ledger_balance || 0;
  const wallet  = ledgerSnapshot.wallet_balance || 0;
  document.getElementById('lpKpis').innerHTML = `
    <div class="lp-kpi-row">
      <span>Outstanding Balance</span>
      <strong class="${balance > 0 ? 'lp-debit' : 'lp-credit'}">
        ₹${fmt(Math.abs(balance))}${balance > 0 ? ' (owes)' : balance < 0 ? ' (credit)' : ''}
      </strong>
    </div>
    <div class="lp-kpi-row">
      <span>Wallet / Store Credit</span>
      <strong>₹${fmt(wallet)}</strong>
    </div>`;

  const tbody = document.getElementById('lpTxnBody');
  tbody.innerHTML = '';

  const txns = ledgerSnapshot.transactions || [];
  if (!txns.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="lp-empty">No transactions</td></tr>`;
  } else {
    txns.forEach(t => {
      const sign = t.amount < 0 ? '−' : '+';
      const cls  = t.amount < 0 ? 'lp-credit' : 'lp-debit';
      const ref  = (t.reference_type && t.reference_id)
        ? `${t.reference_type} #${t.reference_id}` : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtDateShort(t.timestamp)}</td>
        <td>${esc(t.type)}</td>
        <td class="lp-notes">${esc(t.notes || '—')}</td>
        <td class="lp-num ${cls}">${sign}₹${fmt(Math.abs(t.amount))}</td>
        <td class="lp-num lp-ref">${esc(ref)}</td>`;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('ledgerPrintArea').style.display = 'block';
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: '2-digit'
  });
}

// ─── KEYBOARD SHORTCUTS ───────────────────────────────
function setupModalKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closePaymentModal();
      closeSettleModal();
      closeEditCustomer();
      closePrintModal();
      closeDeleteModal();
    }
  });

  document.getElementById('payAmount').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitPayment();
  });

  ['paymentModal','settleModal','editCustomerModal','printModal','deleteCustomerModal'].forEach(id => {
    document.getElementById(id).addEventListener('click', function(e) {
      if (e.target === this) {
        closePaymentModal(); closeSettleModal();
        closeEditCustomer(); closePrintModal();
        closeDeleteModal();
      }
    });
  });
}

// ─── HELPERS ──────────────────────────────────────────
function buildRefLink(t) {
  if (!t.reference_type || !t.reference_id) return '<span class="muted">—</span>';
  const map = { bill: `/bills`, return: `/returns`, payment: null, settlement: null };
  const base = map[t.reference_type];
  if (!base) return `<span class="muted">${t.reference_type}</span>`;
  return `<a href="${base}/${t.reference_id}" class="ref-link">${t.reference_type} #${t.reference_id}</a>`;
}

function fmt(n)  { return parseFloat(n || 0).toFixed(2); }
function esc(s)  { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type}`;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 2800);
}

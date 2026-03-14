'use strict';

let topCustomers = [];   // top 200 by value (initial load)
let isSearchMode = false;
let searchDebounce = null;

document.addEventListener('DOMContentLoaded', () => {
  loadTopCustomers();

  document.getElementById('customerSearch').addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(onSearch, 300);
  });

  document.getElementById('typeFilter').addEventListener('change', () => {
    if (isSearchMode) onSearch();
    else filterLocal();
  });
});

// ─── LOAD TOP 200 BY VALUE ────────────────────────────
async function loadTopCustomers() {
  try {
    const res = await fetch('/api/customers/top');
    console.log('Top customers response', res);
    topCustomers = await res.json();
    isSearchMode = false;
    document.getElementById('modeBanner').style.display = 'none';
    renderCustomers(applyTypeFilter(topCustomers));
  } catch (e) {
    console.error('Failed to load customers', e);
  }
}

function resetToTop() {
  document.getElementById('customerSearch').value = '';
  document.getElementById('typeFilter').value = '';
  loadTopCustomers();
}

// ─── SEARCH (hits API for full dataset) ───────────────
async function onSearch() {
  const q = document.getElementById('customerSearch').value.trim();

  if (!q) { resetToTop(); return; }

  try {
    const res = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    isSearchMode = true;

    const banner = document.getElementById('modeBanner');
    banner.style.display = 'flex';
    document.getElementById('modeText').textContent =
      `Showing ${data.length} search result${data.length !== 1 ? 's' : ''} for "${q}"`;

    renderCustomers(applyTypeFilter(data));
  } catch (e) {
    console.error('Search failed', e);
  }
}

function filterLocal() {
  renderCustomers(applyTypeFilter(topCustomers));
}

function applyTypeFilter(list) {
  const type = document.getElementById('typeFilter').value;
  if (!type) return list;
  return list.filter(c => c.customer_type === type);
}

// ─── RENDER ───────────────────────────────────────────
function renderCustomers(customers) {
  const tbody = document.getElementById('customersBody');
  tbody.innerHTML = '';

  if (!customers.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty">No customers found</td></tr>`;
    return;
  }

  customers.forEach((c, i) => {
  
    const tr = document.createElement('tr');
    const walletCls = (c.wallet_balance || 0) > 0 ? 'amt-credit' : '';
    tr.innerHTML = `
      <td class="mono muted">${i + 1}</td>
      <td class="td-name"><a href="/customers/${c.id}/ledger" class="cust-link">${esc(c.name)}</a></td>
      <td class="mono muted">${esc(c.phone || '—')}</td>
      <td class="muted">${esc(c.village || '—')}</td>
      <td><span class="type-badge type-${(c.customer_type||'regular').toLowerCase()}">${esc(c.customer_type || 'regular')}</span></td>
      <td class="num amt-debit">${c.total_spent != null ? '₹' + fmt(c.total_spent) : '—'}</td>
      <td class="num">${c.bill_count != null ? c.bill_count : '—'}</td>
      <td class="num ${walletCls}">₹${fmt(c.wallet_balance || 0)}</td>
      <td class="actions-cell">
        <a href="/customers/${c.id}/ledger" class="btn-view">Ledger</a>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ─── HELPERS ──────────────────────────────────────────
function fmt(n)  { return parseFloat(n || 0).toFixed(2); }
function esc(s)  { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
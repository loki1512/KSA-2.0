'use strict';

let allTxns = [];
let visibleTxns = [];
let page = 1;
const LIMIT = 100;
let searchDebounce = null;

document.addEventListener('DOMContentLoaded', () => {
  loadTransactions();

  document.getElementById('txnSearch').addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(filterAndRender, 200);
  });

  document.getElementById('typeFilter').addEventListener('change', filterAndRender);
});

async function loadTransactions(append = false) {
  try {
    const res  = await fetch(`/api/transactions?page=${page}&limit=${LIMIT}`);
    const data = await res.json();

    if (!append) allTxns = [];
    allTxns = allTxns.concat(data.transactions);

    document.getElementById('totalBadge').textContent = `${data.total} total`;
    document.getElementById('loadMoreBtn').style.display =
      allTxns.length < data.total ? 'inline-flex' : 'none';

    filterAndRender();
  } catch (e) {
    console.error('Failed to load transactions', e);
  }
}

function loadMore() {
  page++;
  loadTransactions(true);
}

function filterAndRender() {
  const q    = document.getElementById('txnSearch').value.toLowerCase().trim();
  const type = document.getElementById('typeFilter').value;

  visibleTxns = allTxns.filter(t => {
    const matchType = !type || t.type === type;
    const matchQ    = !q || [
      t.customer_name, t.customer_phone, t.type,
      String(t.reference_id), t.notes
    ].some(f => (f || '').toLowerCase().includes(q));
    return matchType && matchQ;
  });

  renderTable(visibleTxns);
}

function renderTable(txns) {
  const tbody = document.getElementById('txnBody');
  tbody.innerHTML = '';

  if (!txns.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">No transactions found</td></tr>`;
    return;
  }

  txns.forEach(t => {
    const tr   = document.createElement('tr');
    const sign = t.amount < 0 ? '−' : '+';
    const cls  = t.amount < 0 ? 'amt-credit' : 'amt-debit';
    const ref  = buildRefLink(t);

    tr.innerHTML = `
      <td class="mono muted">${t.id}</td>
      <td class="date-cell">${fmtDate(t.timestamp)}</td>
      <td><a href="/customers/${t.customer_id}/ledger" class="cust-link">${esc(t.customer_name || '—')}</a></td>
      <td class="mono muted">${esc(t.customer_phone || '—')}</td>
      <td><span class="type-badge type-${t.type.toLowerCase()}">${t.type}</span></td>
      <td class="num ${cls}">${sign}₹${fmt(Math.abs(t.amount))}</td>
      <td>${ref}</td>`;
    tbody.appendChild(tr);
  });
}

function buildRefLink(t) {
  if (!t.reference_type || !t.reference_id) return '<span class="muted">—</span>';

  const map = {
    bill:       `/bills/${t.reference_id}`,
    return:     `/returns/${t.reference_id}`,
    payment:    `/payments/${t.reference_id}`,
    settlement: null
  };

  const url = map[t.reference_type];
  if (!url) return `<span class="muted">${t.reference_type}</span>`;

  return `<a href="${url}" class="ref-link">${t.reference_type} #${t.reference_id}</a>`;
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

// ─── EXPORT TO EXCEL ──────────────────────────────────
function exportTransactions() {
  if (!visibleTxns || !visibleTxns.length) {
    alert('No data to export.'); return;
  }

  const rows = visibleTxns.map((t, i) => ({
    '#':               i + 1,
    'Date':            t.timestamp ? new Date(t.timestamp).toLocaleString('en-IN') : '',
    'Customer':        t.customer_name  || '',
    'Phone':           t.customer_phone || '',
    'Type':            t.type           || '',
    'Amount':          parseFloat(t.amount || 0),
    'Reference Type':  t.reference_type || '',
    'Reference ID':    t.reference_id   || '',
    'Notes':           t.notes          || ''
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 4 }, { wch: 22 }, { wch: 22 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 24 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `transactions_${date}.xlsx`);
}
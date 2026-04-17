'use strict';

const state = {
  topCustomers: [],
  sourceCustomers: [],
  currentVisibleList: [],
  isSearchMode: false,
  searchDebounce: null,
  activeLoadToken: 0,
  sortKey: 'total_spent',
  sortDirection: 'desc'
};

const customerMetricsCache = new Map();
const CURRENCY_SYMBOL = '\u20B9';
const EM_DASH = '\u2014';
const MINUS_SIGN = '\u2212';
const DEFAULT_SORT_KEY = 'total_spent';
const DEFAULT_SORT_DIRECTION = 'desc';
const SORT_DEFAULTS = {
  name: 'asc',
  phone: 'asc',
  village: 'asc',
  customer_type: 'asc',
  total_spent: 'desc',
  bill_count: 'desc',
  outstanding_balance: 'desc',
  wallet_balance: 'desc'
};

document.addEventListener('DOMContentLoaded', () => {
  loadTopCustomers();

  document.getElementById('customerSearch').addEventListener('input', () => {
    clearTimeout(state.searchDebounce);
    state.searchDebounce = setTimeout(onSearch, 300);
  });

  document.getElementById('typeFilter').addEventListener('change', applyCurrentView);
  document.getElementById('outstandingFilter').addEventListener('change', applyCurrentView);
  document.querySelectorAll('.sort-button').forEach(button => {
    button.addEventListener('click', () => toggleSort(button.dataset.sortKey));
  });

  updateSortButtons();
});

async function loadTopCustomers() {
  const token = ++state.activeLoadToken;

  try {
    const data = await fetchJSON('/api/customers/top');
    if (token !== state.activeLoadToken) return;

    state.topCustomers = mergeCachedMetrics(normalizeCustomers(data));
    state.sourceCustomers = state.topCustomers;
    state.isSearchMode = false;
    applyCurrentView();

    const enriched = await enrichCustomers(state.topCustomers, {
      includeMetrics: false,
      onProgress(partial) {
        if (token !== state.activeLoadToken || state.isSearchMode) return;
        state.topCustomers = partial;
        state.sourceCustomers = partial;
        applyCurrentView();
      }
    });

    if (token !== state.activeLoadToken) return;
    state.topCustomers = enriched;
    state.sourceCustomers = enriched;
    applyCurrentView();
  } catch (error) {
    console.error('Failed to load customers', error);
    renderCustomers([]);
  }
}

function resetToTop() {
  document.getElementById('customerSearch').value = '';
  document.getElementById('typeFilter').value = '';
  document.getElementById('outstandingFilter').value = '';
  state.sortKey = DEFAULT_SORT_KEY;
  state.sortDirection = DEFAULT_SORT_DIRECTION;
  updateSortButtons();
  loadTopCustomers();
}

async function onSearch() {
  const q = document.getElementById('customerSearch').value.trim();

  if (!q) {
    loadTopCustomers();
    return;
  }

  const token = ++state.activeLoadToken;

  try {
    const data = await fetchJSON(`/api/customers/search?q=${encodeURIComponent(q)}`);
    if (token !== state.activeLoadToken) return;

    state.isSearchMode = true;
    state.sourceCustomers = mergeCachedMetrics(normalizeCustomers(data));
    applyCurrentView();

    const enriched = await enrichCustomers(state.sourceCustomers, {
      includeMetrics: true,
      onProgress(partial) {
        if (token !== state.activeLoadToken || !state.isSearchMode) return;
        state.sourceCustomers = partial;
        applyCurrentView();
      }
    });

    if (token !== state.activeLoadToken) return;
    state.sourceCustomers = enriched;
    applyCurrentView();
  } catch (error) {
    console.error('Search failed', error);
    renderCustomers([]);
    updateModeBanner();
  }
}

function applyCurrentView() {
  const filtered = sortCustomers(
    applyOutstandingFilter(
      applyTypeFilter(state.sourceCustomers)
    )
  );

  renderCustomers(filtered);
  updateModeBanner();
}

function applyTypeFilter(list) {
  const type = document.getElementById('typeFilter').value;
  if (!type) return [...list];
  return list.filter(customer => (customer.customer_type || '').toLowerCase() === type);
}

function applyOutstandingFilter(list) {
  const filter = document.getElementById('outstandingFilter').value;
  if (!filter) return [...list];

  return list.filter(customer => {
    const balance = toNumberOrNull(customer.outstanding_balance);
    if (balance == null) return false;
    if (filter === 'due') return balance > 0;
    if (filter === 'credit') return balance < 0;
    if (filter === 'settled') return Math.abs(balance) < 0.005;
    return true;
  });
}

function sortCustomers(list) {
  const sorted = [...list];
  const direction = state.sortDirection === 'asc' ? 1 : -1;

  sorted.sort((left, right) => {
    let result = 0;

    switch (state.sortKey) {
      case 'name':
      case 'phone':
      case 'village':
      case 'customer_type':
        result = compareText(left[state.sortKey], right[state.sortKey]);
        break;
      case 'bill_count':
      case 'wallet_balance':
      case 'outstanding_balance':
      case 'total_spent':
      default:
        result = compareNumber(left[state.sortKey], right[state.sortKey]);
        break;
    }

    if (result === 0 && state.sortKey !== 'name') {
      result = compareText(left.name, right.name);
    }

    return result * direction;
  });

  return sorted;
}

function toggleSort(sortKey) {
  if (!sortKey) return;

  if (state.sortKey === sortKey) {
    state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortKey = sortKey;
    state.sortDirection = SORT_DEFAULTS[sortKey] || 'asc';
  }

  updateSortButtons();
  applyCurrentView();
}

function updateSortButtons() {
  document.querySelectorAll('.sort-button').forEach(button => {
    const isActive = button.dataset.sortKey === state.sortKey;
    const indicator = button.querySelector('.sort-indicator');
    const parent = button.closest('th');

    button.classList.toggle('active', isActive);
    button.classList.toggle('is-asc', isActive && state.sortDirection === 'asc');
    button.classList.toggle('is-desc', isActive && state.sortDirection === 'desc');

    if (indicator) {
      indicator.textContent = isActive ? (state.sortDirection === 'asc' ? '↑' : '↓') : '↕';
    }

    if (parent) {
      parent.setAttribute(
        'aria-sort',
        isActive ? (state.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'
      );
    }
  });
}

function renderCustomers(customers) {
  state.currentVisibleList = customers;

  const tbody = document.getElementById('customersBody');
  tbody.innerHTML = '';

  if (!customers.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty">No customers found</td></tr>';
    return;
  }

  customers.forEach((customer, index) => {
    const tr = document.createElement('tr');
    const walletBalance = toNumberOrZero(customer.wallet_balance);
    const outstandingBalance = toNumberOrNull(customer.outstanding_balance);
    const walletCls = walletBalance > 0 ? 'amt-credit' : walletBalance < 0 ? 'amt-debit' : '';
    const outstandingCls = outstandingBalance > 0 ? 'amt-debit' : outstandingBalance < 0 ? 'amt-credit' : '';
    const typeClass = `type-${esc((customer.customer_type || 'regular').toLowerCase())}`;

    tr.innerHTML = `
      <td class="mono muted">${index + 1}</td>
      <td class="td-name"><a href="/customers/${customer.id}/ledger" class="cust-link">${esc(customer.name)}</a></td>
      <td class="mono muted">${esc(customer.phone || EM_DASH)}</td>
      <td class="muted">${esc(customer.village || EM_DASH)}</td>
      <td><span class="type-badge ${typeClass}">${esc(customer.customer_type || 'regular')}</span></td>
      <td class="num amt-debit">${customer.total_spent != null ? formatMoney(customer.total_spent) : EM_DASH}</td>
      <td class="num">${customer.bill_count != null ? customer.bill_count : EM_DASH}</td>
      <td class="num ${outstandingCls}">${formatOutstanding(outstandingBalance)}</td>
      <td class="num ${walletCls}">${formatMoney(walletBalance)}</td>
      <td class="actions-cell">
        <a href="/customers/${customer.id}/ledger" class="btn-view">Ledger</a>
      </td>`;

    tbody.appendChild(tr);
  });
}

function updateModeBanner() {
  const banner = document.getElementById('modeBanner');
  const modeText = document.getElementById('modeText');

  if (!state.isSearchMode) {
    banner.style.display = 'none';
    return;
  }

  const query = document.getElementById('customerSearch').value.trim();
  const total = state.sourceCustomers.length;
  const visible = state.currentVisibleList.length;
  const noun = total === 1 ? 'result' : 'results';

  modeText.textContent = `Showing ${visible} of ${total} search ${noun}${query ? ` for "${query}"` : ''}`;
  banner.style.display = 'flex';
}

async function enrichCustomers(list, options = {}) {
  const { includeMetrics = false, onProgress = null } = options;
  const results = list.map(customer => ({ ...customer }));

  if (!results.length) return results;

  let nextIndex = 0;
  let completed = 0;
  const workerCount = Math.min(10, results.length);

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= results.length) return;

      results[index] = await enrichCustomer(results[index], { includeMetrics });
      completed += 1;

      if (onProgress && (completed % 12 === 0 || completed === results.length)) {
        onProgress(results.map(customer => ({ ...customer })));
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

async function enrichCustomer(customer, options = {}) {
  const { includeMetrics = false } = options;
  const cached = customerMetricsCache.get(customer.id) || {};
  const needsOutstanding = toNumberOrNull(customer.outstanding_balance) == null
    && toNumberOrNull(cached.outstanding_balance) == null;
  const needsMetrics = includeMetrics
    && (toNumberOrNull(customer.total_spent) == null || toNumberOrNull(customer.bill_count) == null)
    && (toNumberOrNull(cached.total_spent) == null || toNumberOrNull(cached.bill_count) == null);

  if (!needsOutstanding && !needsMetrics) {
    return mergeCustomerWithCache(customer);
  }

  try {
    const [details, bills] = await Promise.all([
      needsOutstanding ? fetchJSON(`/api/customers/${customer.id}`) : Promise.resolve(null),
      needsMetrics ? fetchJSON(`/api/customers/${customer.id}/bills`) : Promise.resolve(null)
    ]);

    const patch = {};

    if (details) {
      patch.outstanding_balance = toNumberOrZero(details.ledger_balance);
      patch.wallet_balance = toNumberOrZero(details.wallet_balance);
    }

    if (bills) {
      const billList = Array.isArray(bills) ? bills : [];
      patch.bill_count = billList.length;
      patch.total_spent = billList.reduce((sum, bill) => sum + toNumberOrZero(bill.final_amount), 0);
    }

    return mergeCustomerWithCache({ ...customer, ...patch });
  } catch (error) {
    console.error(`Failed to enrich customer ${customer.id}`, error);
    return mergeCustomerWithCache(customer);
  }
}

function mergeCachedMetrics(list) {
  return list.map(mergeCustomerWithCache);
}

function mergeCustomerWithCache(customer) {
  const cached = customerMetricsCache.get(customer.id) || {};
  const merged = { ...cached, ...customer };

  if (customer.outstanding_balance == null && cached.outstanding_balance != null) {
    merged.outstanding_balance = cached.outstanding_balance;
  }
  if (customer.total_spent == null && cached.total_spent != null) {
    merged.total_spent = cached.total_spent;
  }
  if (customer.bill_count == null && cached.bill_count != null) {
    merged.bill_count = cached.bill_count;
  }
  if (customer.wallet_balance == null && cached.wallet_balance != null) {
    merged.wallet_balance = cached.wallet_balance;
  }

  customerMetricsCache.set(customer.id, {
    outstanding_balance: toNumberOrNull(merged.outstanding_balance),
    total_spent: toNumberOrNull(merged.total_spent),
    bill_count: toNumberOrNull(merged.bill_count),
    wallet_balance: toNumberOrZero(merged.wallet_balance)
  });

  return merged;
}

function normalizeCustomers(customers) {
  return (Array.isArray(customers) ? customers : []).map(customer => ({
    ...customer,
    wallet_balance: toNumberOrZero(customer.wallet_balance),
    total_spent: toNumberOrNull(customer.total_spent),
    bill_count: toNumberOrNull(customer.bill_count),
    outstanding_balance: toNumberOrNull(customer.outstanding_balance ?? customer.ledger_balance)
  }));
}

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function compareNumber(left, right) {
  const leftValue = toNumberOrNull(left);
  const rightValue = toNumberOrNull(right);

  if (leftValue == null && rightValue == null) return 0;
  if (leftValue == null) return 1;
  if (rightValue == null) return -1;
  return leftValue - rightValue;
}

function compareText(left, right) {
  return String(left || '').localeCompare(String(right || ''));
}

function formatOutstanding(value) {
  if (value == null) return '<span class="muted">Loading...</span>';
  return formatMoney(value);
}

function formatMoney(value) {
  const numeric = toNumberOrNull(value);
  if (numeric == null) return EM_DASH;
  const prefix = numeric < 0 ? MINUS_SIGN : '';
  return `${prefix}${CURRENCY_SYMBOL}${fmt(Math.abs(numeric))}`;
}

function fmt(number) {
  return parseFloat(number || 0).toFixed(2);
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toNumberOrZero(value) {
  const numeric = toNumberOrNull(value);
  return numeric == null ? 0 : numeric;
}

function exportCustomers() {
  if (!state.currentVisibleList.length) {
    alert('No data to export.');
    return;
  }

  const rows = state.currentVisibleList.map((customer, index) => ({
    '#': index + 1,
    'Name': customer.name || '',
    'Phone': customer.phone || '',
    'Village': customer.village || '',
    'Type': customer.customer_type || '',
    'Total Spent': customer.total_spent != null ? parseFloat(customer.total_spent) : '',
    'Bill Count': customer.bill_count != null ? parseInt(customer.bill_count, 10) : '',
    'Outstanding': customer.outstanding_balance != null ? parseFloat(customer.outstanding_balance) : '',
    'Wallet Balance': parseFloat(customer.wallet_balance || 0)
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 4 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
    { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `customers_${date}.xlsx`);
}

window.exportCustomers = exportCustomers;
window.resetToTop = resetToTop;

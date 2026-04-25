'use strict';

const DEFAULT_CATEGORY = 'Electrical';

let allItems = [];
let filteredItems = [];
let searchDebounce = null;
let activeViewId = null;

document.addEventListener('DOMContentLoaded', () => {
  loadItems();

  document.getElementById('catalogSearch').addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(applyCatalogSearch, 150);
  });

  ['catItemName', 'catItemCategory', 'catItemDefaultPrice', 'catItemMaxPrice', 'catItemFinalPrice', 'catItemCostPrice']
    .forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveCatalogItem();
        }
      });
    });

  resetEditor();
  renderSmartState('', []);
});

async function loadItems() {
  try {
    const response = await fetch('/api/items');
    allItems = await response.json();
    allItems.sort((left, right) => compareText(left.name, right.name));
    applyCatalogSearch();
  } catch (error) {
    console.error('Failed to load items', error);
  }
}

function applyCatalogSearch() {
  const query = document.getElementById('catalogSearch').value.trim();
  filteredItems = getFilteredItems(query);

  if (activeViewId && !allItems.some(item => item.id === activeViewId)) {
    activeViewId = null;
  }

  renderItems(filteredItems);
  updateItemCount(filteredItems);
  renderSmartState(query, filteredItems);
}

function getFilteredItems(query) {
  if (!query) return [...allItems];

  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

  return allItems.filter(item => {
    const haystack = [
      (item.name || ''),
      (item.category || '')
    ].join(' ').toLowerCase();

    return tokens.every(token => haystack.includes(token));
  });
}

function renderItems(items) {
  const tbody = document.getElementById('catalogItems');
  tbody.innerHTML = '';

  if (!items.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No items found</td></tr>';
    return;
  }

  items.forEach(item => {
    const isActive = activeViewId === item.id;
    const tr = document.createElement('tr');
    tr.dataset.itemId = String(item.id);
    if (isActive) tr.classList.add('is-active');

    tr.innerHTML = `
      <td class="td-name">${esc(item.name)}</td>
      <td class="td-category">${esc(item.category || '-')}</td>
      <td class="num">${formatMoney(item.default_price)}</td>
      <td class="num">${item.max_price != null ? formatMoney(item.max_price) : '-'}</td>
      <td class="num">${item.final_price != null ? formatMoney(item.final_price) : '-'}</td>
      <td class="num">${item.cost_price != null ? formatMoney(item.cost_price) : '-'}</td>
      <td class="num table-updated">${fmtDate(item.updated_at)}</td>
      <td class="actions-col">
        <button class="btn-view" onclick="viewItem(${item.id})">View</button>
        <button class="btn-edit" onclick="startEdit(${item.id})">Edit</button>
        <button class="btn-delete" onclick="deleteItem(${item.id}, '${esc(item.name)}')">Delete</button>
      </td>`;

    tbody.appendChild(tr);
  });
}

function renderSmartState(query, items) {
  const container = document.getElementById('catalogSmartState');
  const exactItem = findExactItem(query);
  const similarItems = items
    .filter(item => !exactItem || item.id !== exactItem.id)
    .slice(0, 4);

  if (!query) {
    container.innerHTML = `
      <div class="smart-card smart-card-empty">
        <div class="smart-title">Start with item search</div>
        <p>Search by name or category. If the item already exists, you can view or edit it. If not, type the new name and add it from the editor.</p>
      </div>`;
    return;
  }

  if (exactItem) {
    container.innerHTML = `
      <div class="smart-card smart-card-match">
        <div class="smart-card-top">
          <div>
            <div class="smart-eyebrow">Existing item</div>
            <div class="smart-title">${esc(exactItem.name)}</div>
            <div class="smart-meta">${esc(exactItem.category || 'Uncategorized')}</div>
          </div>
          <div class="smart-actions">
            <button class="btn btn-ghost btn-sm" type="button" onclick="viewItem(${exactItem.id})">View</button>
            <button class="btn btn-ghost btn-sm" type="button" onclick="startEdit(${exactItem.id})">Edit</button>
          </div>
        </div>
        <div class="smart-price-grid">
          ${buildPriceStat('Default', exactItem.default_price)}
          ${buildPriceStat('Max', exactItem.max_price)}
          ${buildPriceStat('Final', exactItem.final_price)}
        </div>
      </div>
      ${buildSimilarItems(similarItems)}`;
    return;
  }

  container.innerHTML = `
    <div class="smart-card smart-card-create">
      <div class="smart-card-top">
        <div>
          <div class="smart-eyebrow">New item</div>
          <div class="smart-title">"${esc(query)}" is not in the catalogue</div>
          <p class="smart-copy">Use this name and fill in the prices below to create it.</p>
        </div>
        <div class="smart-actions">
          <button class="btn btn-primary-action btn-sm" type="button" onclick="prepareNewItemFromSearch()">Add New Item</button>
        </div>
      </div>
    </div>
    ${buildSimilarItems(similarItems)}`;
}

function buildSimilarItems(items) {
  if (!items.length) return '';

  return `
    <div class="smart-card smart-card-similar">
      <div class="smart-eyebrow">Closest matches</div>
      <div class="smart-similar-list">
        ${items.map(item => `
          <div class="smart-similar-item">
            <div>
              <div class="smart-similar-name">${esc(item.name)}</div>
              <div class="smart-similar-meta">${esc(item.category || 'Uncategorized')}</div>
            </div>
            <div class="smart-similar-actions">
              <button class="btn btn-ghost btn-sm" type="button" onclick="viewItem(${item.id})">View</button>
              <button class="btn btn-ghost btn-sm" type="button" onclick="startEdit(${item.id})">Edit</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function buildPriceStat(label, value) {
  return `
    <div class="smart-price-stat">
      <span>${label}</span>
      <strong>${value != null ? formatMoney(value) : '-'}</strong>
    </div>`;
}

function updateItemCount(items) {
  const total = allItems.length;
  const visible = items.length;
  const label = visible === total ? `${total} items` : `${visible} of ${total} items`;
  document.getElementById('catItemCount').textContent = label;
}

async function saveCatalogItem() {
  const id = document.getElementById('editingItemId').value;
  const name = document.getElementById('catItemName').value.trim();
  const category = document.getElementById('catItemCategory').value.trim() || null;
  const defaultPrice = parseFloat(document.getElementById('catItemDefaultPrice').value);
  const maxPrice = parseNumberOrNull(document.getElementById('catItemMaxPrice').value);
  const finalPrice = parseNumberOrNull(document.getElementById('catItemFinalPrice').value);
  const costPrice = parseNumberOrNull(document.getElementById('catItemCostPrice').value);

  if (!name) {
    alert('Item name is required');
    return;
  }
  if (Number.isNaN(defaultPrice)) {
    alert('Default price is required');
    return;
  }
  if (maxPrice != null && defaultPrice > maxPrice) {
    alert('Default price cannot exceed Max price');
    return;
  }
  if (finalPrice != null && maxPrice != null && finalPrice > maxPrice) {
    alert('Final price cannot exceed Max price');
    return;
  }

  const payload = {
    name,
    category,
    default_price: defaultPrice,
    max_price: maxPrice,
    final_price: finalPrice,
    cost_price: costPrice
  };

  const url = id ? `/api/items/${id}` : '/api/items';
  const method = id ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      alert(data.error || 'Save failed');
      return;
    }

    activeViewId = id ? Number(id) : data.id;
    document.getElementById('catalogSearch').value = name;
    resetEditor();
    await loadItems();
    scrollToItemRow(activeViewId);
  } catch (error) {
    alert('Request failed');
  }
}

function startEdit(id) {
  const item = allItems.find(entry => entry.id === id);
  if (!item) return;

  activeViewId = item.id;
  document.getElementById('catalogSearch').value = item.name;
  document.getElementById('editingItemId').value = item.id;
  document.getElementById('catItemName').value = item.name;
  document.getElementById('catItemCategory').value = item.category || DEFAULT_CATEGORY;
  document.getElementById('catItemDefaultPrice').value = item.default_price;
  document.getElementById('catItemMaxPrice').value = item.max_price ?? '';
  document.getElementById('catItemFinalPrice').value = item.final_price ?? '';
  document.getElementById('catItemCostPrice').value = item.cost_price ?? '';

  document.getElementById('formTitle').textContent = 'Edit Item';
  document.getElementById('cancelEditBtn').style.display = 'inline-flex';
  document.getElementById('saveCatItemBtn').textContent = 'Update Item';

  applyCatalogSearch();
  document.getElementById('catItemName').focus();
  document.getElementById('catalogEditor').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEdit() {
  resetEditor();
  applyCatalogSearch();
}

function prepareNewItemFromSearch() {
  const query = document.getElementById('catalogSearch').value.trim();
  if (!query) return;

  activeViewId = null;
  resetEditor();
  document.getElementById('catItemName').value = query;
  document.getElementById('formTitle').textContent = 'Add Item';
  document.getElementById('saveCatItemBtn').textContent = 'Save Item';
  renderItems(filteredItems);
  document.getElementById('catItemDefaultPrice').focus();
  document.getElementById('catalogEditor').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetEditor() {
  document.getElementById('editingItemId').value = '';
  document.getElementById('catItemName').value = '';
  document.getElementById('catItemCategory').value = DEFAULT_CATEGORY;
  document.getElementById('catItemDefaultPrice').value = '';
  document.getElementById('catItemMaxPrice').value = '';
  document.getElementById('catItemFinalPrice').value = '';

  document.getElementById('formTitle').textContent = 'Add Item';
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('saveCatItemBtn').textContent = 'Save Item';
}

async function deleteItem(id, name) {
  if (!confirm(`Remove "${name}" from the catalogue?`)) return;

  const response = await fetch(`/api/items/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    alert('Delete failed');
    return;
  }

  if (activeViewId === id) {
    activeViewId = null;
    resetEditor();
    if (normalizeText(document.getElementById('catalogSearch').value) === normalizeText(name)) {
      document.getElementById('catalogSearch').value = '';
    }
  }

  await loadItems();
}

function viewItem(id) {
  const item = allItems.find(entry => entry.id === id);
  if (!item) return;

  activeViewId = item.id;
  document.getElementById('catalogSearch').value = item.name;
  applyCatalogSearch();
  scrollToItemRow(id);
}

async function importCatalog() {
  const file = document.getElementById('importFile').files[0];
  const result = document.getElementById('importResult');

  if (!file) {
    result.textContent = 'Please select a file first.';
    result.className = 'error';
    return;
  }

  result.textContent = 'Importing...';
  result.className = '';

  const form = new FormData();
  form.append('file', file);

  try {
    const response = await fetch('/api/items/import', { method: 'POST', body: form });
    const data = await response.json();

    if (!response.ok) {
      result.textContent = data.error || 'Import failed';
      result.className = 'error';
      return;
    }

    result.textContent = `Added: ${data.added}  Updated: ${data.updated}  Skipped: ${data.skipped}`;
    result.className = 'success';
    await loadItems();
  } catch (error) {
    result.textContent = 'Import request failed';
    result.className = 'error';
  }
}

function downloadCatalogExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excel download library is not available. Please refresh and try again.');
    return;
  }

  if (!allItems.length) {
    alert('No catalogue items to download.');
    return;
  }

  const rows = allItems.map(item => ({
    name: item.name || '',
    category: item.category || '',
    default_price: numberOrBlank(item.default_price),
    max_price: numberOrBlank(item.max_price),
    final_price: numberOrBlank(item.final_price),
    cost_price: numberOrBlank(item.cost_price)
  }));

  const headers = ['name', 'category', 'default_price', 'max_price', 'final_price', 'cost_price'];
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  ws['!cols'] = [
    { wch: 34 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catalogue');

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `catalogue_${date}.xlsx`);
}

function findExactItem(query) {
  if (!query) return null;
  const normalizedQuery = normalizeText(query);
  return allItems.find(item => normalizeText(item.name) === normalizedQuery) || null;
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function scrollToItemRow(id) {
  requestAnimationFrame(() => {
    const row = document.querySelector(`[data-item-id="${id}"]`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function parseNumberOrNull(value) {
  if (value === '' || value == null) return null;
  const numeric = parseFloat(value);
  return Number.isNaN(numeric) ? null : numeric;
}

function numberOrBlank(value) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : '';
}

function formatMoney(value) {
  return `₹${fmt(value)}`;
}

function fmt(number) {
  return parseFloat(number || 0).toFixed(2);
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}

function compareText(left, right) {
  return String(left || '').localeCompare(String(right || ''));
}

function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: '2-digit'
  });
}

window.saveCatalogItem = saveCatalogItem;
window.startEdit = startEdit;
window.cancelEdit = cancelEdit;
window.deleteItem = deleteItem;
window.importCatalog = importCatalog;
window.downloadCatalogExcel = downloadCatalogExcel;
window.viewItem = viewItem;
window.prepareNewItemFromSearch = prepareNewItemFromSearch;

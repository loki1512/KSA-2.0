'use strict';

const DEFAULT_CATEGORY = 'Electrical';

let allItems = [];
let filteredItems = [];
let searchDebounce = null;
let activeViewId = null;
let batchCostMode = false;
let missingCostOnly = false;
let costCategoryFilter = '';
let pendingCostUpdates = new Map();
let savingCostUpdates = false;

document.addEventListener('DOMContentLoaded', () => {
  loadItems();

  document.getElementById('catalogSearch').addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(applyCatalogSearch, 150);
  });

  document.getElementById('missingCostOnly')?.addEventListener('change', event => {
    missingCostOnly = event.target.checked;
    applyCatalogSearch();
  });

  document.getElementById('costCategoryFilter')?.addEventListener('change', event => {
    costCategoryFilter = event.target.value;
    applyCatalogSearch();
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
    renderCostCategoryFilter();
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
  let sourceItems = allItems;

  if (batchCostMode && costCategoryFilter) {
    sourceItems = sourceItems.filter(item => (item.category || '') === costCategoryFilter);
  }

  if (batchCostMode && missingCostOnly) {
    sourceItems = sourceItems.filter(item => item.cost_price == null);
  }

  if (!query) return [...sourceItems];

  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

  return sourceItems.filter(item => {
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
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No items found</td></tr>';
    return;
  }

  items.forEach(item => {
    const isActive = activeViewId === item.id;
    const pendingCost = pendingCostUpdates.get(item.id);
    const rowChanged = pendingCost !== undefined;
    const tr = document.createElement('tr');
    tr.dataset.itemId = String(item.id);
    if (isActive) tr.classList.add('is-active');
    if (rowChanged) tr.classList.add('is-cost-dirty');

    tr.innerHTML = `
      <td class="td-name">${esc(item.name)}</td>
      <td class="td-category">${esc(item.category || '-')}</td>
      <td class="num">${formatMoney(item.default_price)}</td>
      <td class="num">${item.max_price != null ? formatMoney(item.max_price) : '-'}</td>
      <td class="num">${item.final_price != null ? formatMoney(item.final_price) : '-'}</td>
      <td class="num">${batchCostMode ? buildCostInput(item, pendingCost) : (item.cost_price != null ? formatMoney(item.cost_price) : '-')}</td>
      <td class="num table-updated">${fmtDate(item.updated_at)}</td>
      <td class="actions-col ${batchCostMode ? 'batch-actions-cell' : ''}">
        ${batchCostMode ? buildCostStatus(item, rowChanged) : `
        <button class="btn-view" onclick="viewItem(${item.id})">View</button>
        <button class="btn-edit" onclick="startEdit(${item.id})">Edit</button>
        <button class="btn-delete" onclick="deleteItem(${item.id}, '${esc(item.name)}')">Delete</button>
        `}
      </td>`;

    tbody.appendChild(tr);
  });
}

function buildCostInput(item, pendingCost) {
  const value = pendingCost !== undefined ? pendingCost : (item.cost_price ?? '');
  return `
    <input
      class="cost-edit-input"
      type="number"
      min="0"
      step="0.01"
      value="${esc(value)}"
      data-cost-item-id="${item.id}"
      aria-label="Cost price for ${esc(item.name)}"
      oninput="handleCostInput(${item.id}, this.value)"
      onkeydown="handleCostKeydown(event, ${item.id})"
    >`;
}

function buildCostStatus(item, rowChanged) {
  if (rowChanged) return '<span class="cost-status cost-status-dirty">Unsaved</span>';
  if (item.cost_price == null) return '<span class="cost-status">Missing</span>';
  return '<span class="cost-status cost-status-saved">Saved</span>';
}

function renderSmartState(query, items) {
  const container = document.getElementById('catalogSmartState');
  const exactItem = findExactItem(query);
  const similarItems = items
    .filter(item => !exactItem || item.id !== exactItem.id)
    .slice(0, 4);

  if (batchCostMode) {
    if (!query) {
      container.innerHTML = `
        <div class="smart-card smart-card-empty">
          <div class="smart-title">Cost update mode is on</div>
          <p>Search by item name or category. The table below stays editable for the matching items.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="smart-card smart-card-empty">
        <div class="smart-title">${items.length} matching items</div>
        <p>Update costs directly in the table below. Use Missing cost only to narrow the list further.</p>
      </div>`;
    return;
  }

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

function renderCostCategoryFilter() {
  const select = document.getElementById('costCategoryFilter');
  if (!select) return;

  const categories = Array.from(new Set(
    allItems
      .map(item => item.category || '')
      .filter(Boolean)
  )).sort(compareText);

  const currentValue = categories.includes(costCategoryFilter) ? costCategoryFilter : '';
  select.innerHTML = `
    <option value="">All</option>
    ${categories.map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join('')}
  `;
  select.value = currentValue;
  costCategoryFilter = currentValue;
}

function toggleCostMode() {
  if (batchCostMode && pendingCostUpdates.size && !confirm('Exit cost update mode and discard unsaved changes?')) {
    return;
  }

  batchCostMode = !batchCostMode;
  pendingCostUpdates.clear();
  savingCostUpdates = false;

  if (!batchCostMode) {
    missingCostOnly = false;
    costCategoryFilter = '';
    const missingCostOnlyInput = document.getElementById('missingCostOnly');
    if (missingCostOnlyInput) missingCostOnlyInput.checked = false;
    const costCategorySelect = document.getElementById('costCategoryFilter');
    if (costCategorySelect) costCategorySelect.value = '';
  }

  updateBatchCostUi();
  applyCatalogSearch();
}

function updateBatchCostUi(message) {
  document.body.classList.toggle('batch-cost-mode', batchCostMode);
  const costModeButton = document.getElementById('costModeBtn');
  costModeButton.textContent = batchCostMode ? 'Update Costs: On' : 'Update Costs: Off';
  costModeButton.setAttribute('aria-pressed', String(batchCostMode));
  document.getElementById('catalogTableTitle').textContent = batchCostMode ? 'Update Cost Prices' : 'Catalogue Items';
  document.getElementById('batchCostSubtitle').hidden = !batchCostMode;
  document.getElementById('batchCostBar').hidden = !batchCostMode;
  document.getElementById('missingCostToggleWrap').hidden = !batchCostMode;
  document.getElementById('costCategoryFilterWrap').hidden = !batchCostMode;

  const changedCount = pendingCostUpdates.size;
  document.getElementById('batchChangedCount').textContent = `${changedCount} changed`;
  document.getElementById('batchSaveStatus').textContent = message || (
    changedCount ? 'Unsaved cost changes are ready to save.' : 'No unsaved cost changes.'
  );
  document.getElementById('saveCostUpdatesBtn').disabled = !changedCount || savingCostUpdates;
}

function handleCostInput(id, rawValue) {
  const item = allItems.find(entry => entry.id === id);
  if (!item) return;

  const input = document.querySelector(`[data-cost-item-id="${id}"]`);
  const parsedNew = parseCostInput(rawValue);
  const normalizedOriginal = normalizeCostValue(item.cost_price ?? '');

  input?.classList.toggle('is-invalid', !parsedNew.valid);

  if (parsedNew.valid && parsedNew.value === normalizedOriginal) {
    pendingCostUpdates.delete(id);
  } else {
    pendingCostUpdates.set(id, rawValue.trim());
  }

  updateBatchCostUi();
  renderCostRowStatus(id);
}

function handleCostKeydown(event, id) {
  if (event.key !== 'Enter') return;

  event.preventDefault();
  const inputs = Array.from(document.querySelectorAll('.cost-edit-input'));
  const index = inputs.findIndex(input => Number(input.dataset.costItemId) === id);
  const nextInput = inputs[index + 1];

  if (nextInput) {
    nextInput.focus();
    nextInput.select();
  } else {
    document.getElementById('saveCostUpdatesBtn').focus();
  }
}

function renderCostRowStatus(id) {
  const row = document.querySelector(`[data-item-id="${id}"]`);
  const item = allItems.find(entry => entry.id === id);
  if (!row || !item) return;

  const isChanged = pendingCostUpdates.has(id);
  row.classList.toggle('is-cost-dirty', isChanged);
  const statusCell = row.querySelector('.batch-actions-cell');
  if (statusCell) statusCell.innerHTML = buildCostStatus(item, isChanged);
}

function discardCostChanges() {
  if (!pendingCostUpdates.size) return;
  if (!confirm('Discard unsaved cost changes?')) return;

  pendingCostUpdates.clear();
  updateBatchCostUi('Cost changes discarded.');
  renderItems(filteredItems);
}

async function saveCostUpdates() {
  if (!pendingCostUpdates.size || savingCostUpdates) return;

  const updates = [];
  for (const [id, rawValue] of pendingCostUpdates.entries()) {
    const parsed = parseCostInput(rawValue);
    const input = document.querySelector(`[data-cost-item-id="${id}"]`);

    if (!parsed.valid) {
      input?.classList.add('is-invalid');
      input?.focus();
      updateBatchCostUi('Fix invalid cost values before saving.');
      return;
    }

    updates.push({ id, cost_price: parsed.value });
  }

  savingCostUpdates = true;
  updateBatchCostUi('Saving cost changes...');
  let finalMessage = '';

  try {
    const response = await fetch('/api/items/costs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: updates })
    });
    const data = await response.json();

    if (!response.ok) {
      finalMessage = data.error || 'Cost update failed.';
      return;
    }

    pendingCostUpdates.clear();
    await loadItems();
    finalMessage = `${data.updated || 0} cost prices saved.`;
  } catch (error) {
    finalMessage = 'Cost update request failed.';
  } finally {
    savingCostUpdates = false;
    updateBatchCostUi(finalMessage);
  }
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
  document.getElementById('catItemCostPrice').value = '';

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

function normalizeCostValue(value) {
  if (value === '' || value == null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Number(numeric.toFixed(2));
}

function parseCostInput(value) {
  if (value === '' || value == null) return { valid: true, value: null };
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return { valid: false, value: null };
  return { valid: true, value: Number(numeric.toFixed(2)) };
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
    .replace(/"/g, '&quot;')
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
window.toggleCostMode = toggleCostMode;
window.handleCostInput = handleCostInput;
window.handleCostKeydown = handleCostKeydown;
window.discardCostChanges = discardCostChanges;
window.saveCostUpdates = saveCostUpdates;

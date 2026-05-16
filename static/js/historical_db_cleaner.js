'use strict';

const DEFAULT_CATEGORY = 'Electrical';

let selectedItem = null;
let matches = [];
let selectedNames = new Set();
let searchTimer = null;
let uncataloguedTimer = null;
let activePreviewOldName = '';

const uncataloguedState = {
  items: [],
  page: 1,
  perPage: 25,
  total: 0,
  totalPages: 1,
  query: '',
  activeName: '',
  activeMode: '',
  similar: []
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  [
    'catalogueSearch',
    'minKeywordMatches',
    'updateKeywordBtn',
    'catalogueResults',
    'targetCard',
    'message',
    'uncataloguedSearch',
    'uncataloguedRefreshBtn',
    'uncataloguedSummary',
    'uncataloguedBody',
    'uncataloguedPrevBtn',
    'uncataloguedNextBtn',
    'uncataloguedPageLabel',
    'matchesPanel',
    'matchesSummary',
    'matchesBody',
    'selectAllBtn',
    'replacePanel',
    'selectedCount',
    'selectedCountTop',
    'replaceName',
    'confirmLabel',
    'confirmText',
    'refreshBtn',
    'replaceBtn'
  ].forEach(id => {
    els[id] = document.getElementById(id);
  });

  els.catalogueSearch.addEventListener('input', handleCatalogueInput);
  els.updateKeywordBtn.addEventListener('click', refreshKeywordMatches);
  els.selectAllBtn.addEventListener('click', selectAllNonExact);
  els.refreshBtn.addEventListener('click', () => {
    if (selectedItem) loadMatches(selectedItem, activePreviewOldName);
  });
  els.confirmText.addEventListener('input', updateReplaceState);
  els.replaceBtn.addEventListener('click', replaceSelectedNames);

  els.uncataloguedSearch.addEventListener('input', handleUncataloguedInput);
  els.uncataloguedRefreshBtn.addEventListener('click', () => loadUncatalogued());
  els.uncataloguedPrevBtn.addEventListener('click', () => changeUncataloguedPage(-1));
  els.uncataloguedNextBtn.addEventListener('click', () => changeUncataloguedPage(1));

  loadUncatalogued();
});

function refreshKeywordMatches() {
  hideMessage();

  if (!selectedItem) {
    showMessage('Select a catalogue item before updating keyword matches', 'error');
    return;
  }

  selectedNames = new Set();
  els.confirmText.value = '';
  loadMatches(selectedItem, activePreviewOldName);
}

function handleCatalogueInput() {
  selectedItem = null;
  activePreviewOldName = '';
  matches = [];
  selectedNames = new Set();
  hideMessage();
  resetPreview();

  clearTimeout(searchTimer);
  const query = els.catalogueSearch.value.trim();

  if (query.length < 2) {
    renderCatalogueResults([]);
    return;
  }

  searchTimer = setTimeout(() => searchCatalogue(query), 200);
}

async function searchCatalogue(query) {
  try {
    const response = await fetch(`/api/items/search?q=${encodeURIComponent(query)}`);
    const items = await response.json();
    renderCatalogueResults(items);
  } catch (error) {
    showMessage('Catalogue search failed', 'error');
  }
}

function renderCatalogueResults(items) {
  els.catalogueResults.innerHTML = '';

  if (!items.length) {
    els.catalogueResults.hidden = true;
    return;
  }

  items.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lookup-option';
    button.innerHTML = `
      ${esc(item.name)}
      <small>${esc(item.category || 'Uncategorized')}</small>`;
    button.addEventListener('click', () => selectCatalogueItem(item));
    els.catalogueResults.appendChild(button);
  });

  els.catalogueResults.hidden = false;
}

async function selectCatalogueItem(item) {
  selectedItem = {
    id: item.id,
    name: item.name
  };
  activePreviewOldName = '';
  selectedNames = new Set();
  els.catalogueSearch.value = item.name;
  els.catalogueResults.hidden = true;
  renderTargetCard('Selected catalogue name', item.name);
  hideMessage();
  await loadMatches(selectedItem);
}

async function selectCatalogueForHistoricalName(item, oldName) {
  selectedItem = {
    id: item.id,
    name: item.name
  };
  activePreviewOldName = oldName;
  selectedNames = new Set();
  els.catalogueSearch.value = item.name;
  els.catalogueResults.hidden = true;
  renderTargetCard('Selected catalogue name', item.name, oldName);
  hideMessage();
  await loadMatches(selectedItem, oldName);
  els.matchesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderTargetCard(label, itemName, oldName = '') {
  els.targetCard.hidden = false;
  els.targetCard.innerHTML = `
    <span>${esc(label)}</span>
    <strong>${esc(itemName)}</strong>
    ${oldName ? `<small>Previewing replacement for ${esc(oldName)}</small>` : ''}`;
}

async function loadMatches(item, oldName = '') {
  try {
    const minKeywordMatches = getMinKeywordMatches();
    const params = new URLSearchParams({
      item_id: item.id,
      min_keyword_matches: minKeywordMatches
    });
    if (oldName) params.set('old_name', oldName);

    const response = await fetch(`/api/admin/historical-db-cleaner/search?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || 'Historical search failed', 'error');
      resetPreview();
      return;
    }

    matches = data.matches || [];
    selectedNames = new Set();
    if (oldName) {
      matches
        .filter(item => !item.is_exact)
        .forEach(item => selectedNames.add(item.name));
    }
    renderMatches();
  } catch (error) {
    showMessage('Historical search failed', 'error');
  }
}

function renderMatches() {
  els.matchesBody.innerHTML = '';
  els.matchesPanel.hidden = false;

  const totalRows = matches.reduce((sum, item) => sum + Number(item.count || 0), 0);
  els.matchesSummary.textContent = activePreviewOldName
    ? `${matches.length} selected name, ${totalRows} bill rows matched. Confirm below before replacing.`
    : `${matches.length} names found, ${totalRows} bill rows matched. Short one or two word exact-keyword names are included automatically.`;

  if (!matches.length) {
    els.matchesBody.innerHTML = '<tr><td colspan="5">No historical bill item names matched this catalogue item.</td></tr>';
    updateReplaceState();
    return;
  }

  matches.forEach(item => {
    const tr = document.createElement('tr');
    const disabled = item.is_exact ? 'disabled' : '';
    tr.innerHTML = `
      <td class="check-col">
        <input type="checkbox" ${disabled} data-name="${escAttr(item.name)}">
      </td>
      <td>${esc(item.name)}</td>
      <td class="num">${Number(item.count || 0)}</td>
      <td>${Number(item.keyword_matches || 0)}</td>
      <td>
        <span class="status-pill ${item.is_exact ? 'exact' : 'old'}">
          ${item.is_exact ? 'Already correct' : item.is_short_exact_keyword_match ? 'Short exact keyword' : 'Can replace'}
        </span>
      </td>`;

    const checkbox = tr.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.checked = selectedNames.has(item.name);
      tr.classList.toggle('is-selected', checkbox.checked);
      checkbox.addEventListener('change', event => {
        if (event.target.checked) selectedNames.add(item.name);
        else selectedNames.delete(item.name);
        tr.classList.toggle('is-selected', event.target.checked);
        updateReplaceState();
      });
    }

    els.matchesBody.appendChild(tr);
  });

  updateReplaceState();
}

function selectAllNonExact() {
  selectedNames = new Set(matches.filter(item => !item.is_exact).map(item => item.name));
  els.matchesBody.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.checked = selectedNames.has(input.dataset.name);
    input.closest('tr')?.classList.toggle('is-selected', input.checked);
  });
  updateReplaceState();
}

function updateReplaceState() {
  const selectedCount = matches
    .filter(item => selectedNames.has(item.name))
    .reduce((sum, item) => sum + Number(item.count || 0), 0);
  const requiredText = selectedItem ? `REPLACE WITH ${selectedItem.name}` : '';
  const canReplace = Boolean(
    selectedItem &&
    selectedNames.size > 0 &&
    els.confirmText.value.trim() === requiredText &&
    selectedCount > 0
  );

  els.replacePanel.hidden = !selectedItem || !matches.length || selectedCount === 0;
  els.selectedCount.textContent = String(selectedCount);
  els.selectedCountTop.textContent = String(selectedCount);
  els.replaceName.textContent = selectedItem ? selectedItem.name : '-';
  els.confirmLabel.textContent = requiredText ? `Type "${requiredText}" to confirm` : 'Confirmation';
  els.replaceBtn.disabled = !canReplace;
}

async function replaceSelectedNames() {
  if (!selectedItem || !selectedNames.size) return;

  const expectedCount = matches
    .filter(item => selectedNames.has(item.name))
    .reduce((sum, item) => sum + Number(item.count || 0), 0);

  els.replaceBtn.disabled = true;

  try {
    const response = await fetch('/api/admin/historical-db-cleaner/replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: selectedItem.id,
        old_names: Array.from(selectedNames),
        expected_count: expectedCount,
        min_keyword_matches: getMinKeywordMatches(),
        confirm_text: els.confirmText.value.trim()
      })
    });
    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || 'Replace failed', 'error');
      updateReplaceState();
      return;
    }

    showMessage(`${data.updated_count} bill item names replaced with "${data.target_name}".`, 'success');
    els.confirmText.value = '';
    activePreviewOldName = '';
    await loadMatches(selectedItem);
    await loadUncatalogued();
  } catch (error) {
    showMessage('Replace request failed', 'error');
    updateReplaceState();
  }
}

function handleUncataloguedInput() {
  clearTimeout(uncataloguedTimer);
  uncataloguedState.query = els.uncataloguedSearch.value.trim();
  uncataloguedState.page = 1;
  uncataloguedTimer = setTimeout(() => loadUncatalogued(), 220);
}

function changeUncataloguedPage(delta) {
  const nextPage = Math.min(
    Math.max(uncataloguedState.page + delta, 1),
    uncataloguedState.totalPages
  );
  if (nextPage === uncataloguedState.page) return;
  uncataloguedState.page = nextPage;
  loadUncatalogued();
}

async function loadUncatalogued() {
  try {
    const params = new URLSearchParams({
      q: uncataloguedState.query,
      page: uncataloguedState.page,
      per_page: uncataloguedState.perPage
    });
    const response = await fetch(`/api/admin/historical-db-cleaner/uncatalogued?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || 'Uncatalogued search failed', 'error');
      return;
    }

    uncataloguedState.items = data.items || [];
    uncataloguedState.page = data.page || 1;
    uncataloguedState.total = data.total || 0;
    uncataloguedState.totalPages = data.total_pages || 1;
    renderUncatalogued();
  } catch (error) {
    showMessage('Uncatalogued search failed', 'error');
  }
}

function renderUncatalogued() {
  els.uncataloguedBody.innerHTML = '';
  els.uncataloguedSummary.textContent = `${uncataloguedState.total} uncatalogued names found. Sorted by frequency.`;
  els.uncataloguedPageLabel.textContent = `Page ${uncataloguedState.page} of ${uncataloguedState.totalPages}`;
  els.uncataloguedPrevBtn.disabled = uncataloguedState.page <= 1;
  els.uncataloguedNextBtn.disabled = uncataloguedState.page >= uncataloguedState.totalPages;

  if (!uncataloguedState.items.length) {
    els.uncataloguedBody.innerHTML = '<tr><td colspan="5">No uncatalogued bill item names found.</td></tr>';
    return;
  }

  uncataloguedState.items.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = uncataloguedState.activeName === item.name ? 'is-selected' : '';
    tr.innerHTML = `
      <td>
        <strong class="bill-item-name">${esc(item.name)}</strong>
        <small class="muted-line">Latest bill: ${formatDate(item.latest_bill_timestamp)}</small>
      </td>
      <td class="num">${Number(item.count || 0)}</td>
      <td class="num">${formatMoney(item.latest_unit_price)}</td>
      <td class="num">${item.score ? Math.round(item.score * 100) + '%' : '-'}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm js-similar" type="button">Search Similar</button>
          <button class="btn btn-ghost btn-sm js-create" type="button">Create Catalogue Item</button>
        </div>
      </td>`;

    tr.querySelector('.js-similar').addEventListener('click', () => loadSimilarCatalogue(item));
    tr.querySelector('.js-create').addEventListener('click', () => showCreateForm(item));
    els.uncataloguedBody.appendChild(tr);

    if (uncataloguedState.activeName === item.name) {
      els.uncataloguedBody.appendChild(buildExpandedRow(item));
    }
  });
}

function buildExpandedRow(item) {
  const tr = document.createElement('tr');
  tr.className = 'expanded-row';
  const td = document.createElement('td');
  td.colSpan = 5;

  if (uncataloguedState.activeMode === 'similar') {
    td.innerHTML = renderSimilarContent(item);
    td.querySelectorAll('.js-use-similar').forEach(button => {
      button.addEventListener('click', () => {
        const match = uncataloguedState.similar.find(entry => String(entry.id) === button.dataset.itemId);
        if (match) selectCatalogueForHistoricalName(match, item.name);
      });
    });
  } else {
    td.innerHTML = renderCreateContent(item);
    td.querySelector('.js-save-created')?.addEventListener('click', () => createCatalogueItemFromBillName(item));
    td.querySelector('.js-cancel-created')?.addEventListener('click', clearExpandedRow);
  }

  tr.appendChild(td);
  return tr;
}

async function loadSimilarCatalogue(item) {
  uncataloguedState.activeName = item.name;
  uncataloguedState.activeMode = 'similar';
  uncataloguedState.similar = [];
  renderUncatalogued();

  try {
    const response = await fetch(`/api/admin/historical-db-cleaner/similar-catalogue?q=${encodeURIComponent(item.name)}`);
    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || 'Similar catalogue search failed', 'error');
      return;
    }

    uncataloguedState.similar = data || [];
    renderUncatalogued();
  } catch (error) {
    showMessage('Similar catalogue search failed', 'error');
  }
}

function showCreateForm(item) {
  uncataloguedState.activeName = item.name;
  uncataloguedState.activeMode = 'create';
  uncataloguedState.similar = [];
  renderUncatalogued();
}

function clearExpandedRow() {
  uncataloguedState.activeName = '';
  uncataloguedState.activeMode = '';
  uncataloguedState.similar = [];
  renderUncatalogued();
}

function renderSimilarContent(item) {
  if (!uncataloguedState.similar.length) {
    return `
      <div class="inline-panel">
        <strong>No similar catalogue items found for ${esc(item.name)}.</strong>
      </div>`;
  }

  return `
    <div class="inline-panel">
      <div class="inline-title">Similar catalogue items for ${esc(item.name)}</div>
      <div class="similar-grid">
        ${uncataloguedState.similar.map(match => `
          <div class="similar-card">
            <div>
              <strong>${esc(match.name)}</strong>
              <span>${esc(match.category || 'Uncategorized')} &middot; ${Math.round(Number(match.score || 0) * 100)}% match</span>
              <small>Default: ${formatMoney(match.default_price)} &middot; Max: ${formatMoney(match.max_price)}</small>
            </div>
            <button class="btn btn-ghost btn-sm js-use-similar" type="button" data-item-id="${escAttr(match.id)}">Preview Replace</button>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function renderCreateContent(item) {
  return `
    <div class="inline-panel create-panel">
      <div class="inline-title">Create catalogue item from ${esc(item.name)}</div>
      <div class="create-reference">Latest bill price: <strong>${formatMoney(item.latest_unit_price)}</strong></div>
      <div class="create-grid">
        <div class="field-group">
          <label for="newItemName">Name</label>
          <input id="newItemName" type="text" value="${escAttr(item.name)}">
        </div>
        <div class="field-group">
          <label for="newItemCategory">Category</label>
          <input id="newItemCategory" type="text" value="${DEFAULT_CATEGORY}">
        </div>
        <div class="field-group">
          <label for="newItemDefaultPrice">Default Price</label>
          <input id="newItemDefaultPrice" type="number" min="0" step="0.01" placeholder="Required">
        </div>
        <div class="field-group">
          <label for="newItemMaxPrice">Max Price</label>
          <input id="newItemMaxPrice" type="number" min="0" step="0.01">
        </div>
        <div class="field-group">
          <label for="newItemFinalPrice">Final Price</label>
          <input id="newItemFinalPrice" type="number" min="0" step="0.01">
        </div>
        <div class="field-group">
          <label for="newItemCostPrice">Cost Price</label>
          <input id="newItemCostPrice" type="number" min="0" step="0.01">
        </div>
      </div>
      <div class="actions-row">
        <button class="btn btn-ghost js-cancel-created" type="button">Cancel</button>
        <button class="btn btn-primary-action js-save-created" type="button">Save and Preview Replace</button>
      </div>
    </div>`;
}

async function createCatalogueItemFromBillName(item) {
  const name = document.getElementById('newItemName').value.trim();
  const category = document.getElementById('newItemCategory').value.trim() || null;
  const defaultPrice = parseNumber(document.getElementById('newItemDefaultPrice').value);
  const maxPrice = parseNumberOrNull(document.getElementById('newItemMaxPrice').value);
  const finalPrice = parseNumberOrNull(document.getElementById('newItemFinalPrice').value);
  const costPrice = parseNumberOrNull(document.getElementById('newItemCostPrice').value);

  if (!name) {
    showMessage('Item name is required', 'error');
    return;
  }
  if (defaultPrice == null) {
    showMessage('Default price is required before creating a catalogue item', 'error');
    return;
  }

  try {
    const response = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category,
        default_price: defaultPrice,
        max_price: maxPrice,
        final_price: finalPrice,
        cost_price: costPrice
      })
    });
    const data = await response.json();

    if (!response.ok) {
      showMessage(data.error || 'Catalogue item creation failed', 'error');
      return;
    }

    showMessage(`Created catalogue item "${name}". Review the replacement preview below.`, 'success');
    clearExpandedRow();
    await selectCatalogueForHistoricalName({ id: data.id, name }, item.name);
    await loadUncatalogued();
  } catch (error) {
    showMessage('Catalogue item creation failed', 'error');
  }
}

function resetPreview() {
  els.catalogueResults.hidden = true;
  els.targetCard.hidden = true;
  els.matchesPanel.hidden = true;
  els.replacePanel.hidden = true;
  els.matchesBody.innerHTML = '';
  els.confirmText.value = '';
}

function showMessage(text, type) {
  els.message.textContent = text;
  els.message.className = `cleaner-message ${type}`;
  els.message.hidden = false;
}

function hideMessage() {
  els.message.hidden = true;
  els.message.textContent = '';
}

function getMinKeywordMatches() {
  const value = Number.parseInt(els.minKeywordMatches.value, 10);
  if (!Number.isFinite(value)) return 2;
  return Math.min(Math.max(value, 1), 10);
}

function parseNumber(value) {
  if (value === '' || value == null) return null;
  const numeric = parseFloat(value);
  return Number.isNaN(numeric) ? null : numeric;
}

function parseNumberOrNull(value) {
  return parseNumber(value);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `Rs. ${numeric.toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: '2-digit'
  });
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(value) {
  return esc(value);
}

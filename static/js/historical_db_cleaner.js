'use strict';

let selectedItem = null;
let matches = [];
let selectedNames = new Set();
let searchTimer = null;

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  [
    'catalogueSearch',
    'minKeywordMatches',
    'updateKeywordBtn',
    'catalogueResults',
    'targetCard',
    'message',
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
  els.refreshBtn.addEventListener('click', () => selectedItem && loadMatches(selectedItem));
  els.confirmText.addEventListener('input', updateReplaceState);
  els.replaceBtn.addEventListener('click', replaceSelectedNames);
});

function refreshKeywordMatches() {
  hideMessage();

  if (!selectedItem) {
    showMessage('Select a catalogue item before updating keyword matches', 'error');
    return;
  }

  selectedNames = new Set();
  els.confirmText.value = '';
  loadMatches(selectedItem);
}

function handleCatalogueInput() {
  selectedItem = null;
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
  selectedNames = new Set();
  els.catalogueSearch.value = item.name;
  els.catalogueResults.hidden = true;
  els.targetCard.hidden = false;
  els.targetCard.innerHTML = `
    <span>Selected catalogue name</span>
    <strong>${esc(item.name)}</strong>
  `;
  hideMessage();
  await loadMatches(selectedItem);
}

async function loadMatches(item) {
  try {
    const minKeywordMatches = getMinKeywordMatches();
    const response = await fetch(
      `/api/admin/historical-db-cleaner/search?item_id=${encodeURIComponent(item.id)}&min_keyword_matches=${encodeURIComponent(minKeywordMatches)}`
    );
    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || 'Historical search failed', 'error');
      resetPreview();
      return;
    }

    matches = data.matches || [];
    selectedNames = new Set();
    renderMatches();
  } catch (error) {
    showMessage('Historical search failed', 'error');
  }
}

function renderMatches() {
  els.matchesBody.innerHTML = '';
  els.matchesPanel.hidden = false;

  const totalRows = matches.reduce((sum, item) => sum + Number(item.count || 0), 0);
  els.matchesSummary.textContent = `${matches.length} names found, ${totalRows} bill rows matched. Short one or two word exact-keyword names are included automatically.`;

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
    checkbox?.addEventListener('change', event => {
      if (event.target.checked) selectedNames.add(item.name);
      else selectedNames.delete(item.name);
      tr.classList.toggle('is-selected', event.target.checked);
      updateReplaceState();
    });

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

  els.replacePanel.hidden = !selectedItem || !matches.length;
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
    await loadMatches(selectedItem);
  } catch (error) {
    showMessage('Replace request failed', 'error');
    updateReplaceState();
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

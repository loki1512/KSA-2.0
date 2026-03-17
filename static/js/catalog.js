'use strict';

let allItems = [];
let searchDebounce = null;

// ─── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadItems();

  document.getElementById('catalogSearch').addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(filterItems, 200);
  });
});

// ─── LOAD ALL ITEMS ───────────────────────────────────
async function loadItems() {
  try {
    const res  = await fetch('/api/items');
    allItems   = await res.json();
    renderItems(allItems);
    document.getElementById('catItemCount').textContent = `${allItems.length} items`;
  } catch (e) {
    console.error('Failed to load items', e);
  }
}

// ─── FILTER (client-side) ─────────────────────────────
function filterItems() {
  const q = document.getElementById('catalogSearch').value.trim();
  if (!q) { renderItems(allItems); return; }
 
  // Split into tokens — every token must match at least one field (name OR category).
  // "gm wire electrical" → ['gm','wire','electrical']
  // All three must hit somewhere across name+category combined.
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
 
  const filtered = allItems.filter(item => {
    const haystack = [
      (item.name     || ''),
      (item.category || '')
    ].join(' ').toLowerCase();
 
    // Every token must appear somewhere in the combined haystack
    return tokens.every(token => haystack.includes(token));
  });
 
  renderItems(filtered);
  renderItems(filtered);
}

// ─── RENDER TABLE ─────────────────────────────────────
function renderItems(items) {
  const tbody = document.getElementById('catalogItems');
  tbody.innerHTML = '';

  if (!items.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No items found</td></tr>`;
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-name">${esc(item.name)}</td>
      <td class="td-category">${esc(item.category || '—')}</td>
      <td class="num">₹${fmt(item.default_price)}</td>
      <td class="num">${item.max_price   ? '₹' + fmt(item.max_price)   : '—'}</td>
      <td class="num">${item.final_price ? '₹' + fmt(item.final_price) : '—'}</td>
      <td class="num" style="color:var(--text-muted); font-size:11.5px;">${fmtDate(item.updated_at)}</td>
      <td class="actions-col">
        <button class="btn-edit" onclick="startEdit(${item.id})">Edit</button>
        <button class="btn-delete" onclick="deleteItem(${item.id}, '${esc(item.name)}')">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ─── SAVE (add or update) ─────────────────────────────
async function saveCatalogItem() {
  const id           = document.getElementById('editingItemId').value;
  const name         = document.getElementById('catItemName').value.trim();
  const category     = document.getElementById('catItemCategory').value.trim() || null;
  const defaultPrice = parseFloat(document.getElementById('catItemDefaultPrice').value);
  const maxPrice     = parseFloat(document.getElementById('catItemMaxPrice').value)   || null;
  const finalPrice   = parseFloat(document.getElementById('catItemFinalPrice').value) || null;

  if (!name) { alert('Item name is required'); return; }
  if (isNaN(defaultPrice)) { alert('Default price is required'); return; }
  if (maxPrice && defaultPrice > maxPrice) { alert('Default price cannot exceed Max price'); return; }
  if (finalPrice && maxPrice && finalPrice > maxPrice) { alert('Final price cannot exceed Max price'); return; }

  const payload = {
    name,
    category,
    default_price: defaultPrice,
    max_price:     maxPrice,
    final_price:   finalPrice
  };

  const url    = id ? `/api/items/${id}` : '/api/items';
  const method = id ? 'PUT' : 'POST';

  try {
    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) { alert(data.error || 'Save failed'); return; }

    clearForm();
    loadItems();
  } catch (e) {
    alert('Request failed');
  }
}

// ─── EDIT ─────────────────────────────────────────────
function startEdit(id) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;

  document.getElementById('editingItemId').value       = item.id;
  document.getElementById('catItemName').value          = item.name;
  document.getElementById('catItemCategory').value      = item.category || '';
  document.getElementById('catItemDefaultPrice').value  = item.default_price;
  document.getElementById('catItemMaxPrice').value      = item.max_price   || '';
  document.getElementById('catItemFinalPrice').value    = item.final_price || '';

  document.getElementById('formTitle').textContent     = 'Edit Item';
  document.getElementById('cancelEditBtn').style.display = 'inline-flex';
  document.getElementById('saveCatItemBtn').textContent  = 'Update Item';
  document.getElementById('catItemName').focus();
  document.getElementById('catItemName').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEdit() { clearForm(); }

function clearForm() {
  ['editingItemId','catItemName','catItemCategory',
   'catItemDefaultPrice','catItemMaxPrice','catItemFinalPrice'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('formTitle').textContent     = 'Add Item';
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('saveCatItemBtn').textContent  = 'Save Item';
}

// ─── DELETE ───────────────────────────────────────────
async function deleteItem(id, name) {
  if (!confirm(`Remove "${name}" from the catalogue?`)) return;

  const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
  if (res.ok) { loadItems(); }
  else { alert('Delete failed'); }
}

// ─── EXCEL IMPORT ─────────────────────────────────────
async function importCatalog() {
  const file = document.getElementById('importFile').files[0];
  const result = document.getElementById('importResult');

  if (!file) { result.textContent = 'Please select a file first.'; result.className = 'error'; return; }

  result.textContent = 'Importing…'; result.className = '';

  const form = new FormData();
  form.append('file', file);

  try {
    const res  = await fetch('/api/items/import', { method: 'POST', body: form });
    const data = await res.json();

    if (!res.ok) {
      result.textContent = data.error || 'Import failed';
      result.className = 'error';
    } else {
      result.textContent = `✓ Added: ${data.added}  Updated: ${data.updated}  Skipped: ${data.skipped}`;
      result.className = 'success';
      loadItems();
    }
  } catch (e) {
    result.textContent = 'Import request failed';
    result.className = 'error';
  }
}

// ─── KEYBOARD: Enter saves ─────────────────────────────
['catItemName','catItemCategory','catItemDefaultPrice',
 'catItemMaxPrice','catItemFinalPrice'].forEach(id => {
  document.getElementById(id)?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveCatalogItem(); }
  });
});

// ─── HELPERS ──────────────────────────────────────────
function fmt(n) { return parseFloat(n || 0).toFixed(2); }
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'2-digit' });
}
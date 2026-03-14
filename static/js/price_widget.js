'use strict';

let pweSelectedItem = null;
let pweRecentEdits  = [];   // last 5 edits shown inline
let pweDebounce     = null;

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('pweSearch');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(pweDebounce);
    const q = input.value.trim();
    if (!q) { pweHideSuggestions(); return; }
    pweDebounce = setTimeout(() => pweFetchSuggestions(q), 250);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') pweHideSuggestions();
  });

  // Save on Enter in any price field
  ['pweDefaultPrice','pweMaxPrice','pweFinalPrice'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); pweSave(); }
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#priceWidget')) pweHideSuggestions();
  });
});

async function pweFetchSuggestions(q) {
  try {
    const res  = await fetch(`/api/items/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    pweRenderSuggestions(data);
  } catch (e) { console.error('PWE search error', e); }
}

function pweRenderSuggestions(items) {
  const cont = document.getElementById('pweSuggestions');
  cont.innerHTML = '';

  if (!items.length) { pweHideSuggestions(); return; }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'pwe-sug-item';
    div.innerHTML = `
      <span class="pwe-sug-name">${pweEsc(item.name)}</span>
      <span class="pwe-sug-price">₹${parseFloat(item.price || 0).toFixed(2)}</span>`;
    div.addEventListener('mousedown', (e) => {
      e.preventDefault();
      pweSelectItem(item);
    });
    cont.appendChild(div);
  });

  cont.style.display = 'block';
}

function pweHideSuggestions() {
  const cont = document.getElementById('pweSuggestions');
  if (cont) cont.style.display = 'none';
}

function pweSelectItem(item) {
  pweSelectedItem = item;
  document.getElementById('pweSearch').value = '';
  pweHideSuggestions();

  document.getElementById('pweItemName').textContent        = item.name;
  document.getElementById('pweDefaultPrice').value          = item.default_price || '';
  document.getElementById('pweMaxPrice').value              = item.max_price     || '';
  document.getElementById('pweFinalPrice').value            = item.final_price   || '';
  document.getElementById('pweStatus').textContent          = '';
  document.getElementById('pweEditRow').style.display       = 'block';
  document.getElementById('pweDefaultPrice').focus();
}

async function pweSave() {
  if (!pweSelectedItem) return;

  const defaultPrice = parseFloat(document.getElementById('pweDefaultPrice').value) || null;
  const maxPrice     = parseFloat(document.getElementById('pweMaxPrice').value)     || null;
  const finalPrice   = parseFloat(document.getElementById('pweFinalPrice').value)   || null;
  const statusEl     = document.getElementById('pweStatus');
  const saveBtn      = document.getElementById('pweSaveBtn');

  if (!defaultPrice) {
    pweSetStatus('Default price is required', 'error');
    return;
  }

  if (maxPrice && defaultPrice > maxPrice) {
    pweSetStatus('Default price cannot exceed Max price', 'error');
    return;
  }

  saveBtn.disabled    = true;
  saveBtn.textContent = '…';

  try {
    const res = await fetch(`/api/items/${pweSelectedItem.id}/price`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        default_price: defaultPrice,
        max_price:     maxPrice,
        final_price:   finalPrice
      })
    });

    const data = await res.json();

    if (!res.ok) {
      pweSetStatus(data.error || 'Update failed', 'error');
      return;
    }

    pweSetStatus(`✓ Updated at ${new Date().toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}`, 'success');

    // Add to recent edits
    pweRecentEdits.unshift({
      name: pweSelectedItem.name,
      default_price: defaultPrice,
      max_price: maxPrice,
      final_price: finalPrice,
      time: new Date()
    });
    pweRecentEdits = pweRecentEdits.slice(0, 5);
    pweRenderRecent();

    // Update local item data
    pweSelectedItem.default_price = defaultPrice;
    pweSelectedItem.max_price     = maxPrice;
    pweSelectedItem.final_price   = finalPrice;

  } catch (e) {
    pweSetStatus('Request failed', 'error');
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Update';
  }
}

function pweSetStatus(msg, type) {
  const el = document.getElementById('pweStatus');
  el.textContent = msg;
  el.className   = `pwe-status pwe-status-${type}`;
}

function pweRenderRecent() {
  const list = document.getElementById('pweRecentList');
  if (!list || !pweRecentEdits.length) return;

  list.innerHTML = '<div class="pwe-recent-title">Recent edits</div>' +
    pweRecentEdits.map(e => `
      <div class="pwe-recent-item">
        <span class="pwe-recent-name">${pweEsc(e.name)}</span>
        <span class="pwe-recent-prices">
          ₹${(e.default_price || 0).toFixed(2)}
          ${e.final_price ? ' → ₹' + e.final_price.toFixed(2) : ''}
        </span>
        <span class="pwe-recent-time">${e.time.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>
      </div>`
    ).join('');
}

function pweEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
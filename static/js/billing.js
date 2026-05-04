/* ===================================================
   billing.js — Kumara Swami Agencies
   =================================================== */

'use strict';

// ─── STATE ────────────────────────────────────────────
let billItems = [];
let savedBillId = null;
let selectedCustomerId = null;
let currentItemMaxPrice = null;
let searchDebounceTimer = null;
let currentFinalPrice = null;
let modalSearchDebounceTimer = null;
let custSearchDebounce = null;
let pendingDeleteIndex = null;
let pendingEditIndex = null;

// Referrer search state (customer creation modal)
let referrerSearchDebounce = null;
let selectedReferrer = null;   // { id, name, phone, village, referral_code }
let villageSearchDebounce = null;
let activeCustomerSuggestionIndex = -1;
let activeVillageSuggestionIndex = -1;
let activeReferrerSuggestionIndex = -1;

// Reverse-calc mode: 'mrp' (default) | 'unit' | 'total'
let reverseMode = 'mrp';

// ─── DOM REFS ─────────────────────────────────────────
const itemNameInput       = document.getElementById('itemName');
const staticKeywordInput  = document.getElementById('staticKeyword');
const qtyInput            = document.getElementById('qty');
const priceInput       = document.getElementById('price');
const itemDiscountType = document.getElementById('itemDiscountType');
const itemDiscountVal  = document.getElementById('itemDiscountValue');
const suggestionsCont  = document.getElementById('suggestions');
const suggestionList   = document.getElementById('suggestionList');
const viewMoreBtn      = document.getElementById('viewMoreBtn');
const itemsBody        = document.getElementById('itemsBody');
const subtotalEl       = document.getElementById('subtotal');
const tableCard        = document.getElementById('tableCard');
const finaliseBar      = document.getElementById('finaliseBar');
const itemCountEl      = document.getElementById('itemCount');

// ─── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  localStorage.removeItem('billingStaticKeyword');
  if (staticKeywordInput) staticKeywordInput.value = '';

  setupCustomerToggle();
  setupCustomerSearch();
  setupSearchListeners();
  setupDiscountLivePreview();
  setupEditModalPreview();
  setupBillDiscountLive();
  setupClearBtn();
  setupReverseModeToggle();
  setupReverseInputs();
  setupReferrerSearch();
  setupVillageSearch();
  setupCustomerModalKeyboard();

  const params = new URLSearchParams(location.search);
  if (params.get('customer_id')) prefillCustomer(parseInt(params.get('customer_id')));
});

// ─── CUSTOMER SEARCH ──────────────────────────────────
function setupCustomerSearch() {
  const input = document.getElementById('customerSearchInput');
  const clearBtn = document.getElementById('clearCustBtn');

  input.addEventListener('input', () => {
    clearTimeout(custSearchDebounce);
    const q = input.value.trim();
    if (!q) { hideCustSuggestions(); return; }
    custSearchDebounce = setTimeout(() => fetchCustomerSuggestions(q), 300);
  });

  input.addEventListener('keydown', (e) => {
    const items = document.querySelectorAll('#customerSuggestionList .suggestion-item');
    const isOpen = document.getElementById('customerSuggestions').style.display !== 'none';

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen || !items.length) return;
      activeCustomerSuggestionIndex = Math.min(activeCustomerSuggestionIndex + 1, items.length - 1);
      highlightKeyboardSuggestions(items, activeCustomerSuggestionIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen || !items.length) return;
      activeCustomerSuggestionIndex = Math.max(activeCustomerSuggestionIndex - 1, -1);
      highlightKeyboardSuggestions(items, activeCustomerSuggestionIndex);
    } else if ((e.key === 'Enter' || e.key === 'Tab') && isOpen && activeCustomerSuggestionIndex >= 0 && items[activeCustomerSuggestionIndex]) {
      e.preventDefault();
      items[activeCustomerSuggestionIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    } else if (e.key === 'Escape') {
      hideCustSuggestions();
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    hideCustSuggestions();
    input.focus();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#custSearchWrap')) hideCustSuggestions();
  });
}

async function fetchCustomerSuggestions(q) {
  try {
    const res  = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    renderCustomerSuggestions(data);
  } catch (e) { console.error('Customer search error', e); }
}

function renderCustomerSuggestions(customers) {
  const list = document.getElementById('customerSuggestionList');
  const cont = document.getElementById('customerSuggestions');
  list.innerHTML = '';
  activeCustomerSuggestionIndex = -1;

  if (!customers.length) { hideCustSuggestions(); return; }

  customers.forEach(c => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.innerHTML = `
      <span class="suggestion-name">${escHtml(c.name)}</span>
      <span class="suggestion-price" style="color:var(--text-muted);font-size:11px;">
        ${c.phone || ''} ${c.village ? '· ' + c.village : ''}
      </span>`;
    div.addEventListener('mousedown', (e) => { e.preventDefault(); selectCustomer(c); });
    list.appendChild(div);
  });

  cont.style.display = 'block';
}

function hideCustSuggestions() {
  activeCustomerSuggestionIndex = -1;
  document.getElementById('customerSuggestions').style.display = 'none';
}

function selectCustomer(c) {
  selectedCustomerId = c.id;
  document.getElementById('customerSearchInput').value = '';
  hideCustSuggestions();

  document.getElementById('chipName').textContent    = c.name;
  document.getElementById('chipPhone').textContent   = c.phone || '';
  document.getElementById('chipVillage').textContent = c.village || '';
  document.getElementById('selectedCustomerChip').style.display = 'flex';

  document.getElementById('walkInFields').style.display      = 'none';
  document.getElementById('walkInAddressWrap').style.display = 'none';
}

function clearSelectedCustomer() {
  selectedCustomerId = null;
  document.getElementById('selectedCustomerChip').style.display = 'none';
  document.getElementById('walkInFields').style.display        = '';
  document.getElementById('walkInAddressWrap').style.display   = '';
}

async function prefillCustomer(id) {
  try {
    const res  = await fetch(`/api/customers/${id}`);
    const data = await res.json();
    if (res.ok) {
      const fields  = document.getElementById('customerFields');
      const chevron = document.getElementById('customerChevron');
      fields.classList.add('open');
      chevron.classList.add('open');
      selectCustomer(data);
    }
  } catch (e) { console.error('Prefill customer error', e); }
}

// ─── CUSTOMER TOGGLE ──────────────────────────────────
function setupCustomerToggle() {
  const toggle  = document.getElementById('customerToggle');
  const fields  = document.getElementById('customerFields');
  const chevron = document.getElementById('customerChevron');

  toggle.addEventListener('click', () => {
    const open = fields.classList.toggle('open');
    chevron.classList.toggle('open', open);
  });
}

// ─── SEARCH ───────────────────────────────────────────
let activeSuggestionIndex = -1;

function setupSearchListeners() {
  itemNameInput.addEventListener('input', () => {
    activeSuggestionIndex = -1;
    clearTimeout(searchDebounceTimer);
    const q = itemNameInput.value.trim();
    if (!q) { hideSuggestions(); return; }
    searchDebounceTimer = setTimeout(() => fetchSuggestions(q, false), 250);
  });

  itemNameInput.addEventListener('keydown', (e) => {
    const items  = suggestionList.querySelectorAll('.suggestion-item');
    const isOpen = suggestionsCont.style.display !== 'none';

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) return;
      activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1);
      highlightSuggestion(items, activeSuggestionIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) return;
      activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, -1);
      highlightSuggestion(items, activeSuggestionIndex);
      if (activeSuggestionIndex === -1) itemNameInput.value = itemNameInput.dataset.typed || itemNameInput.value;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && activeSuggestionIndex >= 0 && items[activeSuggestionIndex]) {
        items[activeSuggestionIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      } else if (!isOpen || activeSuggestionIndex === -1) {
        addItem();
      }
    } else if (e.key === 'Tab' && isOpen && activeSuggestionIndex >= 0) {
      e.preventDefault();
      items[activeSuggestionIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    } else if (e.key === 'Escape') {
      hideSuggestions();
      activeSuggestionIndex = -1;
    }
  });

  itemNameInput.addEventListener('input', () => {
    itemNameInput.dataset.typed = itemNameInput.value;
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#searchInputWrap') && !e.target.closest('#suggestions')) {
      hideSuggestions();
      activeSuggestionIndex = -1;
    }
  });
}

function highlightSuggestion(items, index) {
  items.forEach((el, i) => el.classList.toggle('keyboard-active', i === index));
  if (index >= 0 && items[index]) {
    const nameEl = items[index].querySelector('.suggestion-name');
    if (nameEl) itemNameInput.value = nameEl.textContent;
    items[index].scrollIntoView({ block: 'nearest' });
  }
}

function highlightKeyboardSuggestions(items, index) {
  items.forEach((el, i) => el.classList.toggle('keyboard-active', i === index));
  if (index >= 0 && items[index]) {
    items[index].scrollIntoView({ block: 'nearest' });
  }
}

async function fetchSuggestions(q, forModal) {
  // Prepend static keyword if provided
  const staticKeyword = staticKeywordInput ? staticKeywordInput.value.trim() : '';
  const searchQuery = staticKeyword && q ? `${staticKeyword} ${q}` : (q || '');
  
  try {
    const res   = await fetch(`/api/items/search?q=${encodeURIComponent(searchQuery)}`);
    const items = await res.json();
    if (forModal) renderModalResults(items, searchQuery);
    else renderSuggestions(items);
  } catch (err) { console.error('Search error:', err); }
}

function renderSuggestions(items) {
  suggestionList.innerHTML = '';

  if (!items.length) { hideSuggestions(); return; }

  const show = items.slice(0, 10);
  show.forEach(item => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.innerHTML = `<span class="suggestion-name">${escHtml(item.name)}</span>
                     <span class="suggestion-price">₹${fmtNum(item.price)}</span>`;
    div.addEventListener('mousedown', (e) => { e.preventDefault(); selectItem(item); });
    suggestionList.appendChild(div);
  });

  viewMoreBtn.style.display = items.length >= 10 ? 'block' : 'none';
  suggestionsCont.style.display = 'block';
}

function hideSuggestions() {
  suggestionsCont.style.display = 'none';
}

function selectItem(item) {
  itemNameInput.value = item.name;
  priceInput.value    = item.price;
  hideSuggestions();

  // Reset reverse-calc inputs whenever a new item is selected
  resetReverseInputs();
  qtyInput.focus();
  updateDiscountPreview();

  currentItemMaxPrice = item.max_price || null;
  currentFinalPrice   = item.final_price || null;

  const hintEl      = document.getElementById('maxPriceHint');
  const valEl       = document.getElementById('maxPriceValue');
  const finalHintEl = document.getElementById('finalPriceHint');
  const finalValEl  = document.getElementById('finalPriceValue');

  if (currentItemMaxPrice) {
    valEl.textContent    = `₹${fmtNum(currentItemMaxPrice)}`;
    hintEl.style.display = 'flex';
  } else {
    hintEl.style.display = 'none';
  }

  if (currentFinalPrice) {
    finalValEl.textContent    = `₹${fmtNum(currentFinalPrice)}`;
    finalHintEl.style.display = 'flex';
  } else {
    finalHintEl.style.display = 'none';
  }
}

function setupClearBtn() {
  const clearBtn = document.getElementById('clearItemBtn');
  clearBtn.addEventListener('click', () => {
    itemNameInput.value = '';
    priceInput.value    = '';
    qtyInput.value      = '';
    itemDiscountVal.value = '';
    hideSuggestions();
    resetReverseInputs();
    const discountBox = document.getElementById('discountBox');
    if (discountBox.style.display !== 'none') toggleDiscount();
    itemNameInput.focus();
  });

  // Static keyword clear button
  const clearStaticBtn = document.getElementById('clearStaticKeywordBtn');
  if (clearStaticBtn) {
    clearStaticBtn.addEventListener('click', () => {
      staticKeywordInput.value = '';
      // Trigger new search with current item name
      if (itemNameInput.value.trim()) {
        itemNameInput.dispatchEvent(new Event('input'));
      }
    });
  }
}

// ─── PRODUCT MODAL ────────────────────────────────────
let activeModalIndex = -1;

function openProductModal() {
  hideSuggestions();
  activeModalIndex = -1;
  const modal       = document.getElementById('productModal');
  const searchInput = document.getElementById('modalSearch');
  modal.style.display = 'flex';
  searchInput.value   = itemNameInput.value.trim();
  searchInput.focus();

  if (searchInput.value) fetchSuggestions(searchInput.value, true);
  else renderModalResults([], '');

  searchInput.addEventListener('input', onModalSearch);
  searchInput.addEventListener('keydown', onModalKeydown);
}

function onModalKeydown(e) {
  const list  = document.getElementById('modalResultsList');
  const items = list.querySelectorAll('.modal-result-item:not(.empty)');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeModalIndex = Math.min(activeModalIndex + 1, items.length - 1);
    highlightModalItem(items, activeModalIndex);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeModalIndex = Math.max(activeModalIndex - 1, -1);
    highlightModalItem(items, activeModalIndex);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeModalIndex >= 0 && items[activeModalIndex]) items[activeModalIndex].click();
  } else if (e.key === 'Escape') {
    closeProductModal();
  }
}

function highlightModalItem(items, index) {
  items.forEach((el, i) => el.classList.toggle('keyboard-active', i === index));
  if (index >= 0 && items[index]) items[index].scrollIntoView({ block: 'nearest' });
}

function onModalSearch() {
  clearTimeout(modalSearchDebounceTimer);
  const q = document.getElementById('modalSearch').value.trim();
  if (!q) { renderModalResults([], ''); return; }
  modalSearchDebounceTimer = setTimeout(() => fetchSuggestions(q, true), 250);
}

function closeProductModal() {
  const modal       = document.getElementById('productModal');
  modal.style.display = 'none';
  const searchInput = document.getElementById('modalSearch');
  searchInput.removeEventListener('input', onModalSearch);
  searchInput.removeEventListener('keydown', onModalKeydown);
  activeModalIndex = -1;
}

function renderModalResults(items, q) {
  const list = document.getElementById('modalResultsList');
  list.innerHTML = '';

  if (!items.length) {
    const div = document.createElement('div');
    div.className = 'modal-result-item empty';
    div.textContent = q ? `No products found for "${q}"` : 'Start typing to search products…';
    list.appendChild(div);
    return;
  }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'modal-result-item';
    div.innerHTML = `<span class="modal-item-name">${escHtml(item.name)}</span>
                     <span class="modal-item-price">₹${fmtNum(item.price)}</span>`;
    div.addEventListener('click', () => { selectItem(item); closeProductModal(); });
    list.appendChild(div);
  });
}

// ─── DISCOUNT TOGGLE ──────────────────────────────────
function toggleDiscount() {
  const box  = document.getElementById('discountBox');
  const btn  = document.getElementById('discountToggleBtn');
  const icon = document.getElementById('discountBtnIcon');
  const open = box.style.display === 'none';
  box.style.display = open ? 'block' : 'none';
  btn.classList.toggle('active', open);
  icon.textContent  = open ? '−' : '＋';
  if (open) itemDiscountVal.focus();
}

function setupDiscountLivePreview() {
  [itemDiscountType, itemDiscountVal, priceInput, qtyInput].forEach(el => {
    el.addEventListener('input', updateDiscountPreview);
  });

  qtyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); priceInput.focus(); }
  });

  priceInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const discountOpen = document.getElementById('discountBox').style.display !== 'none';
    if (discountOpen) itemDiscountVal.focus();
    else addItem();
  });

  itemDiscountVal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addItem(); }
  });
}

function updateDiscountPreview() {
  const preview = document.getElementById('discountPreview');
  const price   = parseFloat(priceInput.value) || 0;
  const qty     = parseFloat(qtyInput.value) || 1;
  const type    = itemDiscountType.value;
  const val     = parseFloat(itemDiscountVal.value) || 0;

  if (!price || !val) { preview.textContent = ''; return; }

  const { finalUnit } = calcLineTotal(price, qty, type, val);
  const saving = price - finalUnit;
  preview.textContent = `Save ₹${fmtNum(saving)} per unit · Final unit price ₹${fmtNum(finalUnit)}`;
}

// ─── REVERSE-CALC: MODE TOGGLE ────────────────────────
// Three modes: 'mrp' (normal MRP-first), 'unit' (enter final unit price → derive discount%),
//              'total' (enter line total → derive discount%)
// The discount box (type+value) is auto-managed — user only chooses mode.

function setupReverseModeToggle() {
  document.querySelectorAll('.calc-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      setReverseMode(mode);
    });
  });
}

function setReverseMode(mode) {
  reverseMode = mode;

  // Update active button styling
  document.querySelectorAll('.calc-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Show/hide the appropriate reverse input rows and the standard discount box toggle
  const unitRow    = document.getElementById('reversUnitRow');
  const totalRow   = document.getElementById('reverseTotalRow');
  const discToggle = document.getElementById('discountToggleRow');

  unitRow.style.display    = mode === 'unit'  ? 'flex' : 'none';
  totalRow.style.display   = mode === 'total' ? 'flex' : 'none';
  discToggle.style.display = mode === 'mrp'   ? 'block' : 'none';

  // When leaving MRP mode, close the discount box if open
  if (mode !== 'mrp') {
    const discountBox = document.getElementById('discountBox');
    if (discountBox.style.display !== 'none') toggleDiscount();
  }

  resetReverseInputs();
  syncReverseFromMRP();
  updateDiscountPreview();
}

function setupReverseInputs() {
  const unitInput  = document.getElementById('reverseUnitPrice');
  const totalInput = document.getElementById('reverseLineTotal');

  // Live sync: when user types into reverse inputs, compute discount% from MRP
  unitInput.addEventListener('input', () => {
    if (reverseMode !== 'unit') return;
    const mrp     = parseFloat(priceInput.value) || 0;
    const unit    = parseFloat(unitInput.value);
    const qty     = parseFloat(qtyInput.value) || 1;

    if (!mrp || isNaN(unit)) {
      clearReversePreview(); return;
    }

    // Clamp: unit price cannot exceed MRP or be negative
    const clampedUnit = Math.min(Math.max(unit, 0), mrp);
    const discPct     = mrp > 0 ? ((mrp - clampedUnit) / mrp) * 100 : 0;
    showReversePreview(clampedUnit, discPct, clampedUnit * qty, 'unit');
  });

  totalInput.addEventListener('input', () => {
    if (reverseMode !== 'total') return;
    const mrp      = parseFloat(priceInput.value) || 0;
    const qty      = parseFloat(qtyInput.value) || 1;
    const total    = parseFloat(totalInput.value);

    if (!mrp || !qty || isNaN(total)) {
      clearReversePreview(); return;
    }

    const maxTotal   = mrp * qty;
    const clampedTotal = Math.min(Math.max(total, 0), maxTotal);
    const unitPrice    = qty > 0 ? clampedTotal / qty : 0;
    const discPct      = mrp > 0 ? ((mrp - unitPrice) / mrp) * 100 : 0;
    showReversePreview(unitPrice, discPct, clampedTotal, 'total');
  });

  // Also re-sync when MRP or qty changes (so preview stays accurate)
  priceInput.addEventListener('input', syncReverseFromMRP);
  qtyInput.addEventListener('input', syncReverseFromMRP);
}

// Called when MRP or qty changes — update preview if a reverse input is already filled
function syncReverseFromMRP() {
  if (reverseMode === 'unit') {
    const unitInput = document.getElementById('reverseUnitPrice');
    if (unitInput.value.trim()) unitInput.dispatchEvent(new Event('input'));
  } else if (reverseMode === 'total') {
    const totalInput = document.getElementById('reverseLineTotal');
    if (totalInput.value.trim()) totalInput.dispatchEvent(new Event('input'));
  }
}

function showReversePreview(unitPrice, discPct, lineTotal, source) {
  const preview = document.getElementById('reversePreview');
  if (discPct < 0) {
    preview.style.color = 'var(--danger)';
    preview.textContent = 'Value exceeds MRP — will be clamped to MRP.';
    return;
  }
  preview.style.color = 'var(--success)';
  const pctStr = discPct.toFixed(2);
  const roundedUnitPrice = Math.round(unitPrice);
  const roundedLineTotal = Math.round(lineTotal);
  if (source === 'unit') {
    preview.textContent = `Discount: ${pctStr}% · Line total: ₹${fmtNum(roundedLineTotal)}`;
  } else {
    preview.textContent = `Unit price: ₹${fmtNum(roundedUnitPrice)} · Discount: ${pctStr}%`;
  }
}

function clearReversePreview() {
  const preview = document.getElementById('reversePreview');
  preview.textContent = '';
}

function resetReverseInputs() {
  const unitInput  = document.getElementById('reverseUnitPrice');
  const totalInput = document.getElementById('reverseLineTotal');
  if (unitInput)  unitInput.value  = '';
  if (totalInput) totalInput.value = '';
  clearReversePreview();
}

// Reads current mode and computes the final discount% to pass into calcLineTotal.
// Returns { discountType, discountValue } — always uses % for reverse modes.
function resolveDiscountFromMode() {
  if (reverseMode === 'mrp') {
    const discountOpen = document.getElementById('discountBox').style.display !== 'none';
    return {
      discountType:  discountOpen ? itemDiscountType.value : '',
      discountValue: discountOpen ? (parseFloat(itemDiscountVal.value) || 0) : 0
    };
  }

  const mrp = parseFloat(priceInput.value) || 0;
  if (!mrp) return { discountType: '', discountValue: 0 };

  if (reverseMode === 'unit') {
    const unit    = parseFloat(document.getElementById('reverseUnitPrice').value);
    if (isNaN(unit)) return { discountType: '', discountValue: 0 };
    const clamped = Math.min(Math.max(unit, 0), mrp);
    const roundedUnit = Math.round(clamped);
    const pct     = ((mrp - roundedUnit) / mrp) * 100;
    return { discountType: '%', discountValue: parseFloat(pct.toFixed(4)) };
  }

  if (reverseMode === 'total') {
    const qty   = parseFloat(qtyInput.value) || 1;
    const total = parseFloat(document.getElementById('reverseLineTotal').value);
    if (isNaN(total)) return { discountType: '', discountValue: 0 };
    const maxTotal = mrp * qty;
    const clamped  = Math.min(Math.max(total, 0), maxTotal);
    const roundedTotal = Math.round(clamped);
    const unit     = qty > 0 ? roundedTotal / qty : 0;
    const roundedUnit = Math.round(unit);
    const pct      = ((mrp - roundedUnit) / mrp) * 100;
    return { discountType: '%', discountValue: parseFloat(pct.toFixed(4)) };
  }

  return { discountType: '', discountValue: 0 };
}

// ─── ADD ITEM ─────────────────────────────────────────
function addItem() {
  const name = itemNameInput.value.trim();
  const qty  = parseFloat(qtyInput.value);
  const rate = parseFloat(priceInput.value);

  if (!name)            { showToast('Please enter an item name', 'error'); itemNameInput.focus(); return; }
  if (!qty || qty <= 0) { showToast('Enter a valid quantity', 'error'); qtyInput.focus(); return; }
  if (isNaN(rate) || rate < 0) { showToast('Enter a valid price', 'error'); priceInput.focus(); return; }

  // Validate reverse inputs are present when in reverse mode
  if (reverseMode === 'unit') {
    const unitVal = document.getElementById('reverseUnitPrice').value.trim();
    if (!unitVal) { showToast('Enter the final unit price', 'error'); document.getElementById('reverseUnitPrice').focus(); return; }
  }
  if (reverseMode === 'total') {
    const totVal = document.getElementById('reverseLineTotal').value.trim();
    if (!totVal) { showToast('Enter the line total', 'error'); document.getElementById('reverseLineTotal').focus(); return; }
  }

  const { discountType, discountValue } = resolveDiscountFromMode();
  const { lineTotal, finalUnit }        = calcLineTotal(rate, qty, discountType, discountValue);

  billItems.push({ name, qty, rate, discountType, discountValue, finalUnit, lineTotal });
  renderTable();
  resetItemForm();
  showToast(`${name} added to bill`, 'success');
}

function resetItemForm() {
  itemNameInput.value   = '';
  priceInput.value      = '';
  qtyInput.value        = '';
  itemDiscountVal.value = '';
  hideSuggestions();
  currentItemMaxPrice = null;
  document.getElementById('maxPriceHint').style.display   = 'none';
  document.getElementById('finalPriceHint').style.display = 'none';
  const discountBox = document.getElementById('discountBox');
  if (discountBox.style.display !== 'none') toggleDiscount();
  document.getElementById('discountPreview').textContent = '';
  resetReverseInputs();
  itemNameInput.focus();
}

// ─── LINE TOTAL CALC ──────────────────────────────────
function calcLineTotal(rate, qty, discountType, discountValue) {
  let finalUnit = rate;
  if (discountType === '%' && discountValue > 0) {
    finalUnit = rate - (rate * discountValue / 100);
  } else if (discountType === '₹' && discountValue > 0) {
    finalUnit = rate - discountValue;
  }
  finalUnit = Math.max(0, Math.round(finalUnit));
  const lineTotal = Math.round(finalUnit * qty);
  return { finalUnit, lineTotal };
}

// ─── RENDER TABLE ─────────────────────────────────────
function renderTable() {
  itemsBody.innerHTML = '';
  let subtotal = 0;

  billItems.forEach((item, i) => {
    subtotal += item.lineTotal;

    let discountLabel = '—';
    if (item.discountType === '%' && item.discountValue > 0) {
      // Always show as % with 2 decimal places (covers reverse-computed values)
      discountLabel = `${parseFloat(item.discountValue).toFixed(2)}%`;
    } else if (item.discountType === '₹' && item.discountValue > 0) {
      discountLabel = `₹${fmtNum(item.discountValue)}`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="sno">${i + 1}</td>
      <td class="td-name">${escHtml(item.name)}</td>
      <td class="num">₹${fmtNum(item.rate)}</td>
      <td class="num td-discount">${discountLabel}</td>
      <td class="num">₹${fmtNum(item.finalUnit)}</td>
      <td class="num">${fmtNum(item.qty)}</td>
      <td class="num td-amount">₹${fmtNum(item.lineTotal)}</td>
      <td class="num">
        <div class="td-actions">
          <button class="btn-icon edit" title="Edit" onclick="openEditModal(${i})">✏️</button>
          <button class="btn-icon delete" title="Remove" onclick="openDeleteModal(${i})">🗑️</button>
        </div>
      </td>`;
    itemsBody.appendChild(tr);
  });

  subtotalEl.textContent = fmtNum(subtotal);
  itemCountEl.textContent = `${billItems.length} item${billItems.length !== 1 ? 's' : ''}`;

  const show = billItems.length > 0;
  tableCard.style.display   = show ? 'block' : 'none';
  finaliseBar.style.display = show ? 'flex'  : 'none';
}

function getSubtotal() {
  return billItems.reduce((s, it) => s + it.lineTotal, 0);
}

// ─── EDIT MODAL ───────────────────────────────────────
function openEditModal(index) {
  pendingEditIndex = index;
  const item = billItems[index];
  document.getElementById('editIndex').value         = index;
  document.getElementById('editName').value          = item.name;
  document.getElementById('editQty').value           = item.qty;
  document.getElementById('editPrice').value         = item.rate;
  document.getElementById('editDiscountType').value  = item.discountType || '';
  // Round displayed discount to 2dp so long reverse-computed values look clean
  document.getElementById('editDiscountValue').value = item.discountValue
    ? parseFloat(item.discountValue.toFixed(2)) : '';
  updateEditPreview();
  document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  pendingEditIndex = null;
}

function setupEditModalPreview() {
  ['editQty','editPrice','editDiscountType','editDiscountValue'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateEditPreview);
  });

  ['editName','editQty','editPrice','editDiscountValue'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    });
  });
}

function updateEditPreview() {
  const price   = parseFloat(document.getElementById('editPrice').value) || 0;
  const qty     = parseFloat(document.getElementById('editQty').value) || 1;
  const type    = document.getElementById('editDiscountType').value;
  const val     = parseFloat(document.getElementById('editDiscountValue').value) || 0;
  const preview = document.getElementById('editPreview');

  if (!price) { preview.textContent = ''; return; }
  const { finalUnit, lineTotal } = calcLineTotal(price, qty, type, val);
  preview.textContent = `Line Total: ₹${fmtNum(lineTotal)} · Unit Price: ₹${fmtNum(finalUnit)}`;
}

function saveEdit() {
  const index = pendingEditIndex;
  if (index === null) return;

  const name          = document.getElementById('editName').value.trim();
  const qty           = parseFloat(document.getElementById('editQty').value);
  const rate          = parseFloat(document.getElementById('editPrice').value);
  const discountType  = document.getElementById('editDiscountType').value;
  const discountValue = parseFloat(document.getElementById('editDiscountValue').value) || 0;

  if (!name)            { showToast('Item name cannot be empty', 'error'); return; }
  if (!qty || qty <= 0) { showToast('Enter a valid quantity', 'error'); return; }
  if (isNaN(rate) || rate < 0) { showToast('Enter a valid price', 'error'); return; }

  const { finalUnit, lineTotal } = calcLineTotal(rate, qty, discountType, discountValue);
  billItems[index] = { name, qty, rate, discountType, discountValue, finalUnit, lineTotal };

  renderTable();
  closeEditModal();
  showToast('Item updated', 'success');
}

// ─── DELETE MODAL ─────────────────────────────────────
function openDeleteModal(index) {
  pendingDeleteIndex = index;
  document.getElementById('deleteItemName').textContent = billItems[index].name;
  document.getElementById('deleteModal').style.display = 'flex';
}

function closeDeleteModal() {
  document.getElementById('deleteModal').style.display = 'none';
  pendingDeleteIndex = null;
}

function confirmDelete() {
  if (pendingDeleteIndex === null) return;
  const name = billItems[pendingDeleteIndex].name;
  billItems.splice(pendingDeleteIndex, 1);
  renderTable();
  closeDeleteModal();
  showToast(`${name} removed`, 'success');
}

// ─── FINAL SCREEN ─────────────────────────────────────
function openFinalScreen() {
  if (!billItems.length) { showToast('Add at least one item', 'error'); return; }

  const finalBody = document.getElementById('finalItemsBody');
  finalBody.innerHTML = '';
  billItems.forEach((item, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="sno">${i + 1}</td>
      <td class="td-name">${escHtml(item.name)}</td>
      <td class="num">${fmtNum(item.qty)}</td>
      <td class="num">₹${fmtNum(item.finalUnit)}</td>
      <td class="num td-amount">₹${fmtNum(item.lineTotal)}</td>`;
    finalBody.appendChild(tr);
  });

  const sub = getSubtotal();
  document.getElementById('finalSubtotal').textContent    = fmtNum(sub);
  document.getElementById('finalAmount').textContent      = fmtNum(sub);
  document.getElementById('billDiscountValue').value      = '';

  document.getElementById('step1').style.display = 'none';
  document.getElementById('step2').style.display = 'block';
  setStep(2);
}

function closeFinalScreen() {
  document.getElementById('step2').style.display = 'none';
  document.getElementById('step1').style.display = 'block';
  setStep(1);
}

function setupBillDiscountLive() {
  document.getElementById('billDiscountValue').addEventListener('input', recalcFinal);
  document.getElementById('billDiscountType').addEventListener('change', recalcFinal);
}

function recalcFinal() {
  const sub   = getSubtotal();
  const type  = document.getElementById('billDiscountType').value;
  const val   = parseFloat(document.getElementById('billDiscountValue').value) || 0;
  let final   = sub;

  if (type === '%' && val > 0) final = sub - (sub * val / 100);
  else if (type === '₹' && val > 0) final = sub - val;
  final = Math.max(0, final);

  document.getElementById('finalAmount').textContent = fmtNum(final);
}

// ─── SAVE BILL ────────────────────────────────────────
async function saveBill() {
  const sub  = getSubtotal();
  const type = document.getElementById('billDiscountType').value;
  const val  = parseFloat(document.getElementById('billDiscountValue').value) || 0;
  let final  = sub;
  if (type === '%' && val > 0) final = sub - (sub * val / 100);
  else if (type === '₹' && val > 0) final = sub - val;
  final = Math.max(0, final);

  // Read optional bill date; send as ISO string or null
  const billDateInput = document.getElementById('billDate');
  const billDate = billDateInput && billDateInput.value ? billDateInput.value : null;

  const payload = {
    customer_id:      selectedCustomerId || null,
    customer_name:    selectedCustomerId ? null : (document.getElementById('customerName').value.trim() || null),
    customer_phone:   selectedCustomerId ? null : (document.getElementById('customerPhone').value.trim() || null),
    customer_address: selectedCustomerId ? null : (document.getElementById('customerAddress').value.trim() || null),
    // Pass referral_code for walk-in customer creation
    referral_code:    (!selectedCustomerId && selectedReferrer) ? (selectedReferrer.referral_code || '') : null,
    bill_date:        billDate,   // null → backend uses current timestamp
    subtotal:         sub,
    finalTotal:       final,
    billDiscount:     val > 0 ? { type, value: val } : null,
    items: billItems.map(it => ({
      name:      it.name,
      qty:       it.qty,
      rate:      it.rate,
      lineTotal: it.lineTotal,
      discount:  it.discountType ? { type: it.discountType, value: parseFloat(it.discountValue.toFixed(4)) } : null
    }))
  };

  const btn = document.getElementById('confirmBillBtn');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  try {
    const res = await fetch('/api/bills', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Save failed');
    const data = await res.json();
    savedBillId = data.bill_id;

    document.getElementById('savedBillId').textContent = `#${savedBillId}`;
    document.getElementById('viewBillLink').href       = `/bills/${savedBillId}`;

    document.getElementById('step2').style.display = 'none';
    document.getElementById('step3').style.display = 'block';
    setStep(3);
    showToast('Bill saved successfully!', 'success');

  } catch (err) {
    showToast('Failed to save bill. Please try again.', 'error');
    btn.disabled    = false;
    btn.textContent = 'Save Bill';
  }
}

// ─── RESET ────────────────────────────────────────────
function resetForm() {
  billItems = [];
  savedBillId = null;
  selectedCustomerId = null;
  renderTable();
  resetItemForm();
  document.getElementById('customerName').value    = '';
  document.getElementById('customerPhone').value   = '';
  document.getElementById('customerAddress').value = '';
  clearSelectedCustomer();

  const billDateInput = document.getElementById('billDate');
  if (billDateInput) billDateInput.value = '';

  const fields  = document.getElementById('customerFields');
  const chevron = document.getElementById('customerChevron');
  fields.classList.remove('open');
  chevron.classList.remove('open');

  // Reset reverse mode to default
  setReverseMode('mrp');

  document.getElementById('step3').style.display = 'none';
  document.getElementById('step1').style.display = 'block';
  setStep(1);

  document.getElementById('confirmBillBtn').disabled    = false;
  document.getElementById('confirmBillBtn').textContent = 'Save Bill';
}

// ─── STEP BAR ─────────────────────────────────────────
function setStep(n) {
  const steps = document.querySelectorAll('.step');
  const lines  = document.querySelectorAll('.step-line');

  steps.forEach((el, i) => {
    el.classList.remove('active','done');
    const num = i + 1;
    if (num < n) el.classList.add('done');
    else if (num === n) el.classList.add('active');
  });

  lines.forEach((el, i) => {
    el.classList.toggle('done', i + 1 < n);
  });
}

// ─── HELPERS ──────────────────────────────────────────
function fmtNum(n) {
  const num = parseFloat(n) || 0;
  return num.toFixed(2);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = `toast ${type}`;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 2800);
}

// Close modals on overlay click
['productModal','editModal','deleteModal','customerModal','customerCreatedModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', function(e) {
    if (e.target === this) {
      if (id === 'productModal') closeProductModal();
      else if (id === 'editModal') closeEditModal();
      else if (id === 'deleteModal') closeDeleteModal();
      else if (id === 'customerModal') closeCustomerModal();
      else if (id === 'customerCreatedModal') closeCustomerCreated();
    }
  });
});

// ─── GLOBAL KEYBOARD SHORTCUTS ────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeProductModal();
    closeEditModal();
    closeDeleteModal();
    closeCustomerModal();
    closeCustomerCreated();
    hideSuggestions();
    hideCustSuggestions();
    hideVillageSuggestions();
    hideReferrerSuggestions();
    return;
  }

  if (e.key === 'Enter' && document.getElementById('deleteModal').style.display === 'flex') {
    if (document.activeElement?.textContent?.trim() !== 'Cancel') {
      e.preventDefault();
      confirmDelete();
    }
    return;
  }

  if (e.key === 'Enter' && document.getElementById('customerCreatedModal').style.display === 'flex') {
    e.preventDefault();
    useCreatedCustomer();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.getElementById('step2').style.display === 'block') {
    e.preventDefault();
    saveBill();
  }
});

document.getElementById('billDiscountValue').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('confirmBillBtn').focus(); }
});

// ─── REFERRER SEARCH (customer creation modal) ────────
// Uses the existing /api/customers/search endpoint.
// No new backend endpoints required.

function setupVillageSearch() {
  const input = document.getElementById('newCustVillage');
  if (!input) return;

  input.addEventListener('input', () => {
    activeVillageSuggestionIndex = -1;
    clearTimeout(villageSearchDebounce);
    const q = input.value.trim();
    if (!q) { hideVillageSuggestions(); return; }
    villageSearchDebounce = setTimeout(() => fetchVillageSuggestions(q), 250);
  });

  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q) fetchVillageSuggestions(q);
  });

  input.addEventListener('keydown', (e) => {
    const items = document.querySelectorAll('#newCustVillageSuggestionList .suggestion-item');
    const isOpen = document.getElementById('newCustVillageSuggestions').style.display !== 'none';

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen || !items.length) return;
      activeVillageSuggestionIndex = Math.min(activeVillageSuggestionIndex + 1, items.length - 1);
      highlightKeyboardSuggestions(items, activeVillageSuggestionIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen || !items.length) return;
      activeVillageSuggestionIndex = Math.max(activeVillageSuggestionIndex - 1, -1);
      highlightKeyboardSuggestions(items, activeVillageSuggestionIndex);
    } else if ((e.key === 'Enter' || e.key === 'Tab') && isOpen && activeVillageSuggestionIndex >= 0 && items[activeVillageSuggestionIndex]) {
      e.preventDefault();
      items[activeVillageSuggestionIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    } else if (e.key === 'Escape') {
      hideVillageSuggestions();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#newCustVillageWrap')) hideVillageSuggestions();
  });
}

async function fetchVillageSuggestions(q) {
  try {
    const res = await fetch(`/api/customers/villages?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data = await res.json();
    renderVillageSuggestions(data);
  } catch (e) { console.error('Village search error', e); }
}

function renderVillageSuggestions(villages) {
  const list = document.getElementById('newCustVillageSuggestionList');
  const cont = document.getElementById('newCustVillageSuggestions');
  if (!list || !cont) return;

  list.innerHTML = '';
  activeVillageSuggestionIndex = -1;

  if (!villages.length) {
    cont.style.display = 'none';
    return;
  }

  villages.forEach(village => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.textContent = village;
    div.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectVillageSuggestion(village);
    });
    list.appendChild(div);
  });

  cont.style.display = 'block';
}

function selectVillageSuggestion(village) {
  document.getElementById('newCustVillage').value = village;
  hideVillageSuggestions();
}

function hideVillageSuggestions() {
  activeVillageSuggestionIndex = -1;
  const cont = document.getElementById('newCustVillageSuggestions');
  if (cont) cont.style.display = 'none';
}

function setupReferrerSearch() {
  const input    = document.getElementById('referrerSearchInput');
  const clearBtn = document.getElementById('clearReferrerBtn');

  if (!input) return;   // guard if DOM not ready

  input.addEventListener('input', () => {
    activeReferrerSuggestionIndex = -1;
    clearTimeout(referrerSearchDebounce);
    const q = input.value.trim();
    if (!q) { hideReferrerSuggestions(); clearSelectedReferrer(false); return; }
    referrerSearchDebounce = setTimeout(() => fetchReferrerSuggestions(q), 300);
  });

  input.addEventListener('keydown', (e) => {
    const items = document.querySelectorAll('#referrerSuggestionList .suggestion-item');
    const isOpen = document.getElementById('referrerSuggestions').style.display !== 'none';

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen || !items.length) return;
      activeReferrerSuggestionIndex = Math.min(activeReferrerSuggestionIndex + 1, items.length - 1);
      highlightKeyboardSuggestions(items, activeReferrerSuggestionIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen || !items.length) return;
      activeReferrerSuggestionIndex = Math.max(activeReferrerSuggestionIndex - 1, -1);
      highlightKeyboardSuggestions(items, activeReferrerSuggestionIndex);
    } else if ((e.key === 'Enter' || e.key === 'Tab') && isOpen && activeReferrerSuggestionIndex >= 0 && items[activeReferrerSuggestionIndex]) {
      e.preventDefault();
      items[activeReferrerSuggestionIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    } else if (e.key === 'Escape') {
      hideReferrerSuggestions();
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    hideReferrerSuggestions();
    clearSelectedReferrer(true);
    input.focus();
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#referrerSearchWrap')) hideReferrerSuggestions();
  });
}

async function fetchReferrerSuggestions(q) {
  try {
    const res  = await fetch(`/api/customers/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data = await res.json();
    renderReferrerSuggestions(data);
  } catch (e) { console.error('Referrer search error', e); }
}

function formatReferrerDisplay(c) {
  return [c?.name, c?.phone, c?.village].filter(Boolean).join(' - ');
}

function renderReferrerSuggestions(customers) {
  const list = document.getElementById('referrerSuggestionList');
  const cont = document.getElementById('referrerSuggestions');
  list.innerHTML = '';
  activeReferrerSuggestionIndex = -1;

  if (!customers.length) {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.style.color = 'var(--text-muted)';
    div.style.pointerEvents = 'none';
    div.textContent = 'No customers found';
    list.appendChild(div);
    cont.style.display = 'block';
    return;
  }

  customers.forEach(c => {
    const displayLabel = formatReferrerDisplay(c);
    if (displayLabel) {
      c.name = displayLabel;
      c.phone = '';
      c.village = '';
    }
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.innerHTML = `
      <span class="suggestion-name">${escHtml(c.name)}</span>
      <span class="suggestion-price" style="color:var(--text-muted);font-size:11px;">
        ${c.phone || ''} ${c.village ? '· ' + c.village : ''}
      </span>`;
    div.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectReferrer(c);
    });
    list.appendChild(div);
  });

  cont.style.display = 'block';
}

function selectReferrer(c) {
  selectedReferrer = c;
  document.getElementById('referrerSearchInput').value = '';
  hideReferrerSuggestions();

  // Show confirmation chip
  const chip = document.getElementById('selectedReferrerChip');
  document.getElementById('referrerChipName').textContent  = c.name;
  document.getElementById('referrerChipCode').textContent  = c.referral_code
    ? `Code: ${c.referral_code}` : '';
  document.getElementById('referrerChipPhone').textContent = c.phone || '';
  chip.style.display = 'flex';
}

function clearSelectedReferrer(resetInput = true) {
  selectedReferrer = null;
  document.getElementById('selectedReferrerChip').style.display = 'none';
  if (resetInput) document.getElementById('referrerSearchInput').value = '';
}

function hideReferrerSuggestions() {
  activeReferrerSuggestionIndex = -1;
  const cont = document.getElementById('referrerSuggestions');
  if (cont) cont.style.display = 'none';
}

// ─── CUSTOMER CREATION MODAL ──────────────────────────
let createdCustomer = null;

function openCustomerModal() {
  // Reset referrer state each time modal opens
  clearSelectedReferrer(true);
  hideVillageSuggestions();
  hideReferrerSuggestions();
  document.getElementById("customerModal").style.display = "flex";
  document.getElementById("newCustName").focus();
}

function closeCustomerModal() {
  hideVillageSuggestions();
  hideReferrerSuggestions();
  document.getElementById("customerModal").style.display = "none";
}

async function createCustomer() {
  const name  = document.getElementById("newCustName").value.trim();
  const phone = document.getElementById("newCustPhone").value.trim();

  if (!name || !phone) {
    showToast("Name and phone required", "error");
    return;
  }

  const payload = {
    name:          name,
    phone:         phone,
    email:         document.getElementById("newCustEmail").value.trim(),
    password:      document.getElementById("newCustPassword").value,
    village:       document.getElementById("newCustVillage").value.trim(),
    address:       document.getElementById("newCustAddress").value.trim(),
    // Send the referrer's referral_code if a referrer was selected, else empty string
    referral_code: selectedReferrer ? (selectedReferrer.referral_code || '') : '',
    customer_type: document.getElementById("newCustType").value
  };

  try {
    const res  = await fetch("/api/customers", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || "Customer creation failed", "error");
      return;
    }

    createdCustomer = {
      id:           data.customer_id,
      name:         name,
      phone:        phone,
      referral_code: data.referral_code
    };

    closeCustomerModal();

    document.getElementById("confCustName").textContent    = name;
    document.getElementById("confCustPhone").textContent   = phone;
    document.getElementById("confReferral").textContent    = data.referral_code;
    document.getElementById("confReferredBy").textContent  = selectedReferrer
      ? selectedReferrer.name : '—';

    document.getElementById("customerCreatedModal").style.display = "flex";

    // Clear form fields for next use
    ['newCustName','newCustPhone','newCustEmail','newCustPassword','newCustVillage','newCustAddress'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('newCustType').value = 'regular';
    clearSelectedReferrer(true);
    hideVillageSuggestions();
    hideReferrerSuggestions();

  } catch (err) {
    console.error(err);
    showToast("Server error", "error");
  }
}

function closeCustomerCreated() {
  document.getElementById("customerCreatedModal").style.display = "none";
}

function useCreatedCustomer() {
  if (!createdCustomer) return;
  selectCustomer({
    id:      createdCustomer.id,
    name:    createdCustomer.name,
    phone:   createdCustomer.phone,
    village: ""
  });
  closeCustomerCreated();
  showToast("Customer added to bill", "success");
}

function setupCustomerModalKeyboard() {
  const nameInput = document.getElementById('newCustName');
  const phoneInput = document.getElementById('newCustPhone');
  const emailInput = document.getElementById('newCustEmail');
  const passwordInput = document.getElementById('newCustPassword');
  const villageInput = document.getElementById('newCustVillage');
  const addressInput = document.getElementById('newCustAddress');
  const referrerInput = document.getElementById('referrerSearchInput');
  const typeInput = document.getElementById('newCustType');

  if (!nameInput || !phoneInput || !emailInput || !passwordInput || !villageInput || !addressInput || !referrerInput || !typeInput) return;

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); phoneInput.focus(); }
  });

  phoneInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); emailInput.focus(); }
  });

  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); passwordInput.focus(); }
  });

  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); villageInput.focus(); }
  });

  villageInput.addEventListener('keydown', (e) => {
    const isOpen = document.getElementById('newCustVillageSuggestions').style.display !== 'none';
    if (e.key === 'Enter' && !isOpen) { e.preventDefault(); addressInput.focus(); }
  });

  addressInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      createCustomer();
    }
  });

  referrerInput.addEventListener('keydown', (e) => {
    const isOpen = document.getElementById('referrerSuggestions').style.display !== 'none';
    if (e.key === 'Enter' && !isOpen) { e.preventDefault(); typeInput.focus(); }
  });

  typeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      createCustomer();
    }
  });
}

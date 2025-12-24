import { dom } from "./dom.js";
import { state } from "./state.js";
import { applyDiscount } from "./discounts.js";
import { render } from "./render.js";

export function addItemFromForm() {
  const name = dom.itemName.value.trim();
  const qty = parseFloat(dom.qty.value);
  const price = parseFloat(dom.price.value);

  if (!name || !qty || !price) return;

  let dtype = null;
  let dval = 0;

  if (state.discountEnabled) {
    dtype = dom.itemDiscountType.value;
    dval = parseFloat(dom.itemDiscountValue.value || 0);
  }

  const base = qty * price;
  const final = applyDiscount(base, dtype, dval);

  const item = {
    name,
    qty,
    price,
    discount_type: dval ? dtype : null,
    discount_value: dval || null,
    final
  };

  if (state.editingIndex !== null) {
    state.items[state.editingIndex] = item;
    state.editingIndex = null;
  } else {
    state.items.push(item);
  }
  state.discountEnabled = false;

  clearForm();
  render();
}

/* ---------- EDIT ---------- */
export function editItem(index) {
  const item = state.items[index];
  if (!item) return;

  dom.itemName.value = item.name;
  dom.qty.value = item.qty;
  dom.price.value = item.price;

  if (item.discount_type) {
    state.discountEnabled = true;
    document.getElementById("discountBox").style.display = "block";
    document.getElementById("discountToggleBtn").innerText = "Remove item discount";
    dom.itemDiscountType.value = item.discount_type;
    dom.itemDiscountValue.value = item.discount_value;
  } else {
    state.discountEnabled = false;
    document.getElementById("discountBox").style.display = "none";
    dom.itemDiscountValue.value = "";
  }

  state.editingIndex = index;
}

/* ---------- DELETE ---------- */
export function deleteItem(index) {
  if (!confirm("Delete this item?")) return;

  state.items.splice(index, 1);
  render();
}

/* ---------- HELPERS ---------- */
function clearForm() {
  dom.itemName.value = "";
  dom.qty.value = 1;
  dom.price.value = "";
  dom.itemDiscountValue.value = "";
  state.discountEnabled = false;
  document.getElementById("discountBox").style.display = "none";
  document.getElementById("discountToggleBtn").innerText = "Add item discount";
}

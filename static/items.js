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

  render();
}

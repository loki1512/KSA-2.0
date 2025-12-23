export function applyDiscount(amount, type, value) {
  if (!type || !value || value <= 0) return amount;

  if (type === "%") {
    return +(amount * (1 - value / 100)).toFixed(2);
  }

  if (type === "₹") {
    return Math.max(amount - value, 0);
  }

  return amount;
}

import { state } from "./state.js";

export function toggleDiscount() {
  const box = document.getElementById("discountBox");
  const btn = document.getElementById("discountToggleBtn");

  state.discountEnabled = !state.discountEnabled;

  if (state.discountEnabled) {
    box.style.display = "block";
    if (btn) btn.innerText = "Remove item discount";
  } else {
    box.style.display = "none";
    if (btn) btn.innerText = "Add item discount";

    const dval = document.getElementById("itemDiscountValue");
    if (dval) dval.value = "";
  }
}


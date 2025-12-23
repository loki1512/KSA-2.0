import { state } from "./state.js";
import { dom } from "./dom.js";

export function updateFinalBill() {
  // ✅ AUTHORITATIVE subtotal
  const subtotal = state.items.reduce(
    (sum, item) => sum + Number(item.final),
    0
  );

  const dtype = dom.billDiscountType.value;
  console.log(dom.billDiscountType.value,dom.billDiscountValue.value)
  const dval = parseFloat(dom.billDiscountValue.value || 0);

  let finalAmount = subtotal;


  if (dval > 0) {
    if (dtype === "%") {
      finalAmount = subtotal * (1 - dval / 100);
    } else if (dtype === "₹") {
      finalAmount = Math.max(subtotal - dval, 0);
    }
  }

  // ✅ Display only (format here)
  dom.finalSubtotal.innerText = subtotal.toFixed(2);
  dom.finalAmount.innerText = finalAmount.toFixed(2);
}


export function openFinalScreen() {
  document.getElementById("finalScreen").style.display = "block";
  document.getElementById("finaliseBtn").style.display = "none";
  updateFinalBill();
}

export function closeFinalScreen() {
  document.getElementById("finalScreen").style.display = "none";
  document.getElementById("finaliseBtn").style.display = "block";
}


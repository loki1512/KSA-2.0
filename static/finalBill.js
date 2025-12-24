import { state } from "./state.js";
import { dom } from "./dom.js";

/* ---------- Recalculate final bill ---------- */
export function updateFinalBill() {
  const subtotal = state.items.reduce(
    (sum, item) => sum + Number(item.final || 0),
    0
  );

  state.subtotal = subtotal;

  const dtype = dom.billDiscountType.value;
  const dval = parseFloat(dom.billDiscountValue.value || 0);

  let discountAmount = 0;
  let finalTotal = subtotal;

  if (dval > 0) {
    if (dtype === "%") {
      discountAmount = subtotal * (dval / 100);
    } else if (dtype === "₹") {
      discountAmount = Math.min(dval, subtotal);
    }
    finalTotal = subtotal - discountAmount;
  }

  state.billDiscountType = dtype;
  state.billDiscountValue = dval;
  state.billDiscountAmount = discountAmount;
  state.finalTotal = finalTotal;

  dom.finalSubtotal.innerText = subtotal.toFixed(2);
  dom.finalAmount.innerText = finalTotal.toFixed(2);
}

/* ---------- Open final screen & freeze snapshot ---------- */
export function openFinalScreen() {
  document.getElementById("finalScreen").style.display = "block";
  document.getElementById("finaliseBtn").style.display = "none";

  updateFinalBill();

  // 🔒 SNAPSHOT (THIS WAS BECOMING NaN BEFORE)
  state.bill = {
    subtotal: state.subtotal,
    billDiscount: {
      type: state.billDiscountType,
      value: state.billDiscountValue,
      amount: state.billDiscountAmount
    },
    finalTotal: state.finalTotal,
    items: state.items.map(it => ({
      name: it.name,
      qty: it.qty,
      rate: it.price,
      discount: it.discount_type
        ? {
            type: it.discount_type,
            value: it.discount_value,
            amount: (it.qty * it.price) - it.final
          }
        : null,
      lineTotal: it.final
    }))
  };

  console.log("FINAL BILL SNAPSHOT:", state.bill);
}

/* ---------- Close final screen ---------- */
export function closeFinalScreen() {
  document.getElementById("finalScreen").style.display = "none";
  document.getElementById("finaliseBtn").style.display = "block";
}

/* ---------- Save bill ---------- */
export async function saveBill() {
  if (!state.bill) {
    throw new Error("Bill not finalized");
  }

  const res = await fetch("/api/bills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.bill)
  });

 if (!res.ok) {
  const text = await res.text();
  console.error("SAVE BILL BACKEND ERROR:", text);
  throw new Error(text);
}


  return await res.json();
}

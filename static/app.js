import { addItemFromForm, editItem, deleteItem } from "./items.js";
import { initSearch } from "./search.js";
import { toggleDiscount } from "./discounts.js";
import { initDom } from "./dom.js";
import { updateFinalBill, openFinalScreen, closeFinalScreen, saveBill } from "./finalBill.js";
import { dom } from "./dom.js";

/* ---------- Expose globals for inline HTML ---------- */
window.addItem = addItemFromForm;
window.editItem = editItem;
window.deleteItem = deleteItem;
window.toggleDiscount = toggleDiscount;
window.openFinalScreen = openFinalScreen;
window.closeFinalScreen = closeFinalScreen;

/* ---------- DOM init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initDom();

  dom.billDiscountType.addEventListener("change", updateFinalBill);
  dom.billDiscountValue.addEventListener("input", updateFinalBill);

  initSearch(
    document.getElementById("itemName"),
    document.getElementById("suggestions")
  );

  document.getElementById("confirmBillBtn").onclick = async () => {
    const result = await saveBill();
    alert(`Bill ${result.bill_id} saved`);
  };
});

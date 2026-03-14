import { addItemFromForm, editItem, deleteItem } from "./items.js";
import { initSearch } from "./search.js";
import { toggleDiscount } from "./discounts.js";
import { initDom, dom } from "./dom.js";
import {
  updateFinalBill,
  openFinalScreen,
  closeFinalScreen,
  saveBill
} from "./finalBill.js";
// import { initCustomerSection } from "./customer.js";
import { state } from "./state.js";

/* ---------- Expose globals for inline HTML ---------- */
window.addItem = addItemFromForm;
window.editItem = editItem;
window.deleteItem = deleteItem;
window.toggleDiscount = toggleDiscount;
window.openFinalScreen = openFinalScreen;
window.closeFinalScreen = closeFinalScreen;
import { initCustomerSection } from "./customer.js";
/* ---------- App Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // 1. DOM registry
  initDom();
  console.log("Customer toggle:", dom.toggleCustomer.checked);


  // 2. Customer section (depends on dom)
  

document.addEventListener("DOMContentLoaded", () => {
  initDom();
  initCustomerSection();
});

  // initCustomerSection();

  // 3. Bill discount listeners
  dom.billDiscountType.addEventListener("change", updateFinalBill);
  dom.billDiscountValue.addEventListener("input", updateFinalBill);
  dom.toggleCustomer.addEventListener("change", initCustomerSection);

  // 4. Search
  initSearch(dom.itemName, dom.suggestionsBox);

  // 5. Finalise bill
  document.getElementById("confirmBillBtn").onclick = async () => {
    console.log("bill:", state.bill);
    const result = await saveBill();
    state.savedBillId = result.bill_id;
    alert(`Bill ${result.bill_id} saved`);
  };

  //6. View saved bill
  document.getElementById("viewBillBtn").onclick = async () => {
    if (!state.savedBillId) {
      alert("No saved bill to view.");
      return;
    }
    window.open(`/bills/${state.savedBillId}`, "_blank");
  };

});

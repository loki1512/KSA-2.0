import { addItemFromForm } from "./items.js";
import { initSearch } from "./search.js";
import { toggleDiscount } from "./discounts.js";
import { initDom } from "./dom.js";
import { updateFinalBill } from "./finalBill.js";
import { dom } from "./dom.js";
window.addItem = addItemFromForm;

document.addEventListener("DOMContentLoaded", () => {
    initDom();
    dom.billDiscountType.addEventListener("change", updateFinalBill);
  dom.billDiscountValue.addEventListener("input", updateFinalBill);
  initSearch(
    document.getElementById("itemName"),
    document.getElementById("suggestions")
  );
});




window.toggleDiscount = toggleDiscount;
// import { initSearch } from "./search.js";

// import { addItemFromForm } from "./items.js";

window.toggleDiscount = toggleDiscount;


window.addItem = addItemFromForm;

import { openFinalScreen, closeFinalScreen } from "./finalBill.js";

window.openFinalScreen = openFinalScreen;
window.closeFinalScreen = closeFinalScreen;


export const dom = {};

export function initDom() {
  dom.billDiscountType = document.getElementById("billDiscountType");
  dom.billDiscountValue = document.getElementById("billDiscountValue");
  dom.finalSubtotal = document.getElementById("finalSubtotal");
  dom.finalAmount = document.getElementById("finalAmount");

  dom.itemName = document.getElementById("itemName");
  dom.qty = document.getElementById("qty");
  dom.price = document.getElementById("price");

  dom.itemDiscountType = document.getElementById("itemDiscountType");
  dom.itemDiscountValue = document.getElementById("itemDiscountValue");
  dom.discountToggleBtn = document.getElementById("discountToggleBtn");
  dom.discountBox = document.getElementById("discountBox");

  dom.itemsTableBody = document.getElementById("items");
  dom.subtotal = document.getElementById("subtotal");
  dom.suggestionsBox = document.getElementById("suggestions");
  dom.finaliseBtn = document.getElementById("finaliseBtn");
}

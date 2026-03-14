export const dom = {};

export function initDom() {
  dom.billDiscountType = document.getElementById("billDiscountType");
  dom.billDiscountValue = document.getElementById("billDiscountValue");
  dom.finalSubtotal = document.getElementById("finalSubtotal");
  dom.finalAmount = document.getElementById("finalAmount");
  dom.toggleCustomer = document.getElementById("toggleCustomer");
dom.customerFields = document.getElementById("customerFields");
dom.customerName = document.getElementById("customerName");
dom.customerPhone = document.getElementById("customerPhone");
dom.customerAddress = document.getElementById("customerAddress");


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

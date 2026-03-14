import { state } from "./state.js";

export function render() {
  const tbody = document.getElementById("items");
  tbody.innerHTML = "";

  let subtotal = 0;

  state.items.forEach((i, idx) => {
    subtotal += i.final;

    tbody.innerHTML += `
      <tr>
        <td>${idx + 1}</td>
        <td>${i.name}<br/><small>Qty: ${i.qty}</small></td>
        <td>₹${i.price}</td>
        <td>${i.discount_value ? `${i.discount_value}${i.discount_type}` : "—"}</td>
        <td>₹${(i.final / i.qty).toFixed(2)}</td>
        <td><strong>₹${i.final.toFixed(2)}</strong></td>
        <td>
          <button onclick="editItem(${idx})">✏️</button>
          <button onclick="deleteItem(${idx})">❌</button>
        </td>
      </tr>
    `;
  });

  document.getElementById("subtotal").innerText = subtotal.toFixed(2);
}

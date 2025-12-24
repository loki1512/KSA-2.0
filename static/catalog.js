let editingId = null;
let allItems = []; // 🔒 cache

/* ---------- Load catalogue items ---------- */
async function loadCatalog() {
  const res = await fetch("/api/items");
  allItems = await res.json();
  renderCatalog(allItems);
}

/* ---------- Render ---------- */
function renderCatalog(items) {
  const tbody = document.getElementById("catalogItems");
  tbody.innerHTML = "";

  items.forEach(item => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${item.name}</td>
      <td>₹${item.default_price.toFixed(2)}</td>
      <td>
        <button onclick="editItem(${item.id}, '${escapeQuotes(item.name)}', ${item.default_price})">
          Edit
        </button>
        <button onclick="deleteItem(${item.id})">
          Delete
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/* ---------- Search ---------- */
document.getElementById("catalogSearch").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();

  if (!q) {
    renderCatalog(allItems);
    return;
  }

  const filtered = allItems.filter(item =>
    item.name.toLowerCase().includes(q)
  );

  renderCatalog(filtered);
});

/* ---------- Helpers ---------- */
function escapeQuotes(str) {
  return str.replace(/'/g, "\\'");
}

/* ---------- Edit ---------- */
window.editItem = (id, name, price) => {
  editingId = id;
  document.getElementById("catItemName").value = name;
  document.getElementById("catItemPrice").value = price;
};

/* ---------- Delete ---------- */
window.deleteItem = async (id) => {
  if (!confirm("Delete this item?")) return;

  await fetch(`/api/items/${id}`, { method: "DELETE" });
  await loadCatalog(); // 🔁 refresh cache
};

/* ---------- Add / Update ---------- */
document.getElementById("saveCatItemBtn").addEventListener("click", async () => {
  const name = document.getElementById("catItemName").value.trim();
  const price = parseFloat(document.getElementById("catItemPrice").value);

  if (!name || isNaN(price)) {
    alert("Please enter valid name and price");
    return;
  }

  if (editingId) {
    await fetch(`/api/items/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, price })
    });
  } else {
    await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, price })
    });
  }

  editingId = null;
  document.getElementById("catItemName").value = "";
  document.getElementById("catItemPrice").value = "";

  await loadCatalog(); // 🔁 refresh cache
});

/* ---------- Excel Import ---------- */
document.getElementById("importBtn").addEventListener("click", async () => {
  const fileInput = document.getElementById("importFile");
  if (!fileInput.files.length) {
    alert("Select an Excel file first");
    return;
  }

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);

  const res = await fetch("/api/items/import", {
    method: "POST",
    body: formData
  });

  const result = await res.json();

  document.getElementById("importResult").innerText =
    `Added: ${result.added}, Updated: ${result.updated}, Skipped: ${result.skipped}`;

  await loadCatalog(); // 🔁 refresh cache
});

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", loadCatalog);

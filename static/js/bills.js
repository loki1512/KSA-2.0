const searchInput = document.getElementById("billSearch");
const fromDateInput = document.getElementById("fromDate");
const toDateInput = document.getElementById("toDate");

const rows = Array.from(document.querySelectorAll(".bill-row"));

function normalize(text) {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

function applyFilters() {
  const q = normalize(searchInput.value);
  const keywords = q ? q.split(" ") : [];

  const fromDate = fromDateInput.value;
  const toDate = toDateInput.value;

  rows.forEach(row => {
    let visible = true;

    // 🔍 Keyword search (same logic as catalog)
    if (keywords.length) {
      const haystack = normalize(row.dataset.text);
      visible = keywords.every(kw => haystack.includes(kw));
    }

    // 📅 From date filter
    if (visible && fromDate) {
      visible = row.dataset.date >= fromDate;
    }

    // 📅 To date filter
    if (visible && toDate) {
      visible = row.dataset.date <= toDate;
    }

    row.style.display = visible ? "" : "none";
  });
}

// Attach listeners
searchInput.addEventListener("input", applyFilters);
fromDateInput.addEventListener("change", applyFilters);
toDateInput.addEventListener("change", applyFilters);

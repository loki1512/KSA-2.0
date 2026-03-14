import { state } from "./state.js";

export function initSearch(itemInput, suggestionsBox) {
    console.log("initSearch called");
  itemInput.addEventListener("input", async (e) => {
    if (["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;

    const q = itemInput.value.trim();
    if (q.length < 2) {
      hideSuggestions(suggestionsBox);
      return;
    }

    const res = await fetch(`/api/items/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;

    state.suggestions = await res.json();
    state.selectedSuggestionIndex = -1;
    renderSuggestions(suggestionsBox);
  });

  itemInput.addEventListener("keydown", (e) => {
    if (!state.suggestions.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      state.selectedSuggestionIndex =
        (state.selectedSuggestionIndex + 1) % state.suggestions.length;
      highlight(suggestionsBox);
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      state.selectedSuggestionIndex =
        (state.selectedSuggestionIndex - 1 + state.suggestions.length) %
        state.suggestions.length;
      highlight(suggestionsBox);
    }

    if (e.key === "Enter" && state.selectedSuggestionIndex >= 0) {
      e.preventDefault();
      selectSuggestion(itemInput, suggestionsBox);
    }

    if (e.key === "Escape") {
      hideSuggestions(suggestionsBox);
    }
  });
}

function renderSuggestions(box) {
  box.innerHTML = "";

  state.suggestions.forEach((item, idx) => {
    const div = document.createElement("div");
    div.innerText = `${item.name} — ₹${item.price}`;
    div.style.padding = "6px";
    div.style.cursor = "pointer";
    div.onclick = () => {
      state.selectedSuggestionIndex = idx;
      selectSuggestion(document.getElementById("itemName"), box);
    };
    box.appendChild(div);
  });

  box.style.display = "block";
}

function highlight(box) {
  [...box.children].forEach((el, idx) => {
    el.style.background =
      idx === state.selectedSuggestionIndex ? "#e6e6e6" : "#fff";
  });
}

function selectSuggestion(input, box) {
  const item = state.suggestions[state.selectedSuggestionIndex];
  if (!item) return;

  input.value = item.name;
  document.getElementById("price").value = item.price;

  hideSuggestions(box);
  document.getElementById("qty").focus();
}

function hideSuggestions(box) {
  box.style.display = "none";
}

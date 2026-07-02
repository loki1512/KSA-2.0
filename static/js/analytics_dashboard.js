const state = {
  period: "last_30",
  startDate: "",
  endDate: "",
  summary: null,
  revenueDetail: null,
  activeChart: null,
  miniChart: null,
  tabChart: null,
  refTrendChart: null,
  refVillageChart: null,
  refPieChart: null,
};

// ─────────────────────────────────────────────────────────
// SLOW ITEMS HEATMAP – constants & cache
// ─────────────────────────────────────────────────────────
const SLOW_PRICE_BANDS = [
  { key: "10k_plus",  label: "Rs 10k+",     min: 10000, max: Infinity },
  { key: "2k_10k",   label: "Rs 2k–10k",   min: 2000,  max: 10000 },
  { key: "500_2k",   label: "Rs 500–2k",   min: 500,   max: 2000 },
  { key: "100_500",  label: "Rs 100–500",  min: 100,   max: 500 },
  { key: "under_100",label: "Under Rs 100", min: 0,    max: 100 },
];

const SLOW_STALE_BANDS = [
  { key: "never",  label: "Never Sold",   test: (d) => d === null },
  { key: "y_plus", label: "365+ days",    test: (d) => d !== null && d >= 365 },
  { key: "h_y",    label: "181–365 days", test: (d) => d !== null && d >= 181 && d < 365 },
  { key: "q_h",    label: "91–180 days",  test: (d) => d !== null && d >= 91  && d < 181 },
  { key: "m_q",    label: "31–90 days",   test: (d) => d !== null && d >= 31  && d < 91 },
  { key: "short",  label: "≤30 days",     test: (d) => d !== null && d < 31 },
];

let _slowItemsData = null;
let _outstandingMode = "total"; // "total" = all-time ledger | "period" = revenue − payments

const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => Array.from(document.querySelectorAll(selector));

function formatMoney(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatPct(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function setText(selector, value) {
  const element = qs(selector);
  if (element) element.textContent = value;
}

function params() {
  const query = new URLSearchParams({ period: state.period });
  if (state.period === "custom") {
    if (state.startDate) query.set("start_date", state.startDate);
    if (state.endDate) query.set("end_date", state.endDate);
  }
  return query.toString();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function setLoading() {
  ["#kpiRevenue", "#kpiOutstanding", "#kpiMargin", "#kpiSlowItems", "#kpiCollectionRate"].forEach((selector) => {
    setText(selector, "-");
  });
  setText("#periodLabel", "Loading...");
}

async function loadDashboard() {
  setLoading();
  try {
    const [summary, revenueDetail, refSummary, refLeaderboard] = await Promise.all([
      fetchJson(`/analytics/api/summary?${params()}`),
      fetchJson(`/analytics/api/revenue/detail?${params()}`),
      fetchJson(`/analytics/api/referral/summary?${params()}`),
      fetchJson(`/analytics/api/referral/leaderboard?${params()}`),
    ]);
    state.summary = summary;
    state.revenueDetail = revenueDetail;
    
    renderSummary(summary);
    renderMiniChart(revenueDetail.daily_revenue || []);
    renderRevenueTabChart(revenueDetail.daily_revenue || []);
    
    renderReferralSummary(refSummary);
    renderReferralLeaderboard(refLeaderboard);
  } catch (error) {
    qs("#periodLabel").textContent = error.message;
  }
}

function renderSummary(data) {
  const topProduct = (data.top_products || [])[0] || {};
  const qualityScore = Math.max(
    0,
    Math.min(100, Math.round((data.cash.collection_rate_pct || 0) - ((data.cash.outstanding_pct || 0) * 0.25) + ((data.customers.repeat_pct || 0) * 0.25))),
  );

  setText("#periodLabel", `${data.period.start} to ${data.period.end}`);
  setText("#kpiRevenue", formatMoney(data.revenue.total));
  setText("#kpiRevenueGrowth", `${formatPct(data.revenue.growth_pct)} vs previous period`);
  setText("#kpiCollectionRate", `${data.cash.collection_rate_pct}%`);
  setText("#kpiPayments", `${formatMoney(data.cash.payments)} collected`);
  // Store both outstanding values on the tile so the toggle can switch without a re-fetch
  const _outstandingTile = qs("#outstandingTile");
  if (_outstandingTile) {
    _outstandingTile.dataset.totalOutstanding    = data.cash.outstanding;
    _outstandingTile.dataset.periodOutstanding   = data.cash.period_outstanding ?? 0;
    _outstandingTile.dataset.totalOutstandingPct = data.cash.outstanding_pct;
    _outstandingTile.dataset.periodOutstandingPct = _safeCoverage(data.cash.period_outstanding ?? 0, data.revenue.total);
  }
  _renderOutstandingTile();
  setText("#kpiMargin", formatMoney(data.margin.gross_margin));
  setText("#kpiMarginPct", `${data.margin.margin_pct}% on known-cost sales`);
  setText("#kpiRepeatCustomerPct", `${data.customers.repeat_pct}%`);
  setText("#kpiActiveCustomers", `${data.customers.active || 0} active customers`);
  setText("#kpiConcentration", `${data.customers.top_customer_concentration_pct}%`);
  setText("#kpiTopProduct", topProduct.name || "-");
  setText("#kpiTopProductMeta", topProduct.revenue == null ? "-" : `${formatMoney(topProduct.revenue)} | ${formatNumber(topProduct.units)} units`);
  setText("#kpiSlowItems", formatNumber(data.slow_items));

  const newData = data.revenue.by_type.new || {};
  const repeatData = data.revenue.by_type.repeat || {};
  setText("#newCustomerRevenue", formatMoney(newData.revenue));
  setText("#newCustomerCount", `${newData.customers || 0} customers`);
  setText("#repeatCustomerRevenue", formatMoney(repeatData.revenue));
  setText("#repeatCustomerCount", `${repeatData.customers || 0} customers`);
  setText("#snapRevenuePerCustomer", formatMoney(data.revenue.revenue_per_customer));
  setText("#snapAvgBill", formatMoney(data.revenue.avg_bill));
  setText("#snapUnitsPerBill", formatNumber(data.revenue.units_per_bill));
  setText("#snapRevenueQuality", `${qualityScore}/100`);
  setText("#revenueAvgBill", formatMoney(data.revenue.avg_bill));
  setText("#revenuePerCustomer", formatMoney(data.revenue.revenue_per_customer));
  setText("#revenuePerBill", formatMoney(data.revenue.avg_bill));
  setText("#revenueUnitsPerBill", formatNumber(data.revenue.units_per_bill));
  setText("#customerActive", formatNumber(data.customers.active));
  setText("#customerNew", formatNumber(data.customers.new));
  setText("#customerRepeatPct", `${data.customers.repeat_pct}%`);
  setText("#customerConcentration", `${data.customers.top_customer_concentration_pct}%`);
  setText("#productSlowItems", formatNumber(data.slow_items));
  setText("#costedRevenue", formatMoney(data.margin.costed_revenue));
  setText("#knownCost", formatMoney(data.margin.known_cost));
  setText("#marginConfidence", `${_safeCoverage(data.margin.costed_revenue, data.revenue.total)}%`);

  const list = qs("#categoryList");
  list.innerHTML = (data.categories || []).map((item) => `
    <button class="category-row" type="button" data-category="${escapeHtml(item.category)}">
      <div>
        <strong>${escapeHtml(item.category)}</strong>
        <span>${item.pct}% of revenue</span>
      </div>
      <span>${formatMoney(item.revenue)}</span>
    </button>
  `).join("") || `<div class="empty-state">No category data</div>`;

  qsa(".category-row").forEach((row) => {
    row.addEventListener("click", () => openCategory(row.dataset.category));
  });

  renderPriorityList(data);
  renderAgingList(data.cash.aging_buckets || []);
  renderDebtorList(data.cash.top_debtors || []);
  renderProductList(data.top_products || []);
  renderMarginCategoryList(data.margin.by_category || []);
}

function _renderOutstandingTile() {
  const tileEl = qs("#outstandingTile");
  if (!tileEl || tileEl.dataset.totalOutstanding == null) return;

  const isTotal = _outstandingMode === "total";
  const val     = isTotal ? tileEl.dataset.totalOutstanding : tileEl.dataset.periodOutstanding;
  const periodPct = Number(tileEl.dataset.periodOutstandingPct || 0);

  // Only show % label in period mode (all-time % vs revenue is misleading)
  const pct = isTotal
    ? ""
    : `${periodPct}% of period revenue`;
  const label = isTotal ? "Outstanding" : "Period Outstanding";

  setText("#kpiOutstanding",     formatMoney(Number(val || 0)));
  setText("#kpiOutstandingPct",  pct);
  setText("#kpiOutstandingLabel", label);

  const infoDot = qs("#outstandingInfoDot");
  if (infoDot) {
    const infoText = isTotal
      ? "Total positive customer ledger balance as of the selected period end date."
      : "Period Outstanding Formula: (Total Sales in the period) - (Total Payments received in the period). Negative means more payments were received than sales made.";
    infoDot.dataset.info = infoText;
    infoDot.title = infoText;
  }

  // Color-code the tile based on period outstanding as % of period revenue
  tileEl.classList.remove("outstanding-green", "outstanding-yellow", "outstanding-red");
  if (!isTotal) {
    if (periodPct < 10) {
      tileEl.classList.add("outstanding-green");
    } else if (periodPct < 30) {
      tileEl.classList.add("outstanding-yellow");
    } else {
      tileEl.classList.add("outstanding-red");
    }
  }

  // Sync the pill active state
  qsa("#outstandingTileToggle .tile-toggle-opt").forEach((opt) => {
    opt.classList.toggle("active", opt.dataset.mode === _outstandingMode);
  });
}

function _safeCoverage(part, total) {
  const totalValue = Number(total || 0);
  return totalValue ? Math.round((Number(part || 0) / totalValue) * 100) : 0;
}

function renderPriorityList(data) {
  const items = [
    ["Revenue growth %", `${formatPct(data.revenue.growth_pct)} vs previous`],
    ["Collection rate %", `${data.cash.collection_rate_pct}% collected`],
    ["Aging buckets", `${(data.cash.aging_buckets || []).length} buckets`],
    ["Top debtors", `${(data.cash.top_debtors || []).length} customers`],
    ["Repeat customer %", `${data.customers.repeat_pct}%`],
    ["Customer concentration", `${data.customers.top_customer_concentration_pct}% top 5`],
    ["Top products", `${(data.top_products || []).length} ranked`],
    ["Margin by category", `${(data.margin.by_category || []).length} categories`],
  ];
  qs("#priorityList").innerHTML = items.map(([label, value]) => `
    <div class="priority-row">
      <span class="status-dot"></span>
      <div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>
    </div>
  `).join("");
}

function renderAgingList(rows) {
  qs("#agingList").innerHTML = rows.map((bucket) => `
    <button class="category-row" type="button" data-modal="outstanding">
      <div>
        <strong>${escapeHtml(bucket.bucket)}</strong>
        <span>${formatNumber(bucket.count)} customers</span>
      </div>
      <span>${formatMoney(bucket.total)}</span>
    </button>
  `).join("") || `<div class="empty-state">No outstanding balances</div>`;
  qsa("#agingList [data-modal]").forEach((button) => {
    button.addEventListener("click", () => renderOutstandingModal());
  });
}

function renderDebtorList(rows) {
  qs("#debtorList").innerHTML = rows.map((customer) => `
    <button class="category-row" type="button" data-customer-id="${customer.customer_id}">
      <div>
        <strong>${escapeHtml(customer.name)}</strong>
        <span>${escapeHtml(customer.phone || "")}</span>
      </div>
      <span>${formatMoney(customer.outstanding)}</span>
    </button>
  `).join("") || `<div class="empty-state">No debtors</div>`;
  bindCustomerRows();
}

function renderProductList(rows) {
  qs("#productList").innerHTML = rows.map((item) => `
    <div class="category-row static-row">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${item.pct}% of revenue | ${formatNumber(item.units)} units</span>
      </div>
      <span>${formatMoney(item.revenue)}</span>
    </div>
  `).join("") || `<div class="empty-state">No product sales</div>`;
}

function renderMarginCategoryList(rows) {
  qs("#marginCategoryList").innerHTML = rows.map((item) => `
    <button class="category-row" type="button" data-category="${escapeHtml(item.category)}">
      <div>
        <strong>${escapeHtml(item.category)}</strong>
        <span>${item.margin_pct}% margin on valid-cost rows</span>
      </div>
      <span>${formatMoney(item.margin)}</span>
    </button>
  `).join("") || `<div class="empty-state">No known-cost category margin</div>`;
  qsa("#marginCategoryList [data-category]").forEach((row) => {
    row.addEventListener("click", () => openCategory(row.dataset.category));
  });
}

function renderMiniChart(rows) {
  const ctx = qs("#revenueMiniChart");
  if (state.miniChart) state.miniChart.destroy();

  state.miniChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: rows.map((row) => row.date),
      datasets: [{
        label: "Revenue",
        data: rows.map((row) => row.revenue),
        borderColor: "#2563eb",
        backgroundColor: "rgba(37, 99, 235, 0.08)",
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (item) => formatMoney(item.raw) } },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { ticks: { callback: (value) => formatMoney(value) } },
      },
    },
  });
}

function renderRevenueTabChart(rows) {
  const ctx = qs("#revenueTabChart");
  if (!ctx) return;
  if (state.tabChart) state.tabChart.destroy();

  state.tabChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: rows.map((row) => row.date),
      datasets: [{
        label: "Revenue",
        data: rows.map((row) => row.revenue),
        backgroundColor: "#11845b",
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (item) => formatMoney(item.raw) } },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { ticks: { callback: (value) => formatMoney(value) } },
      },
    },
  });
}

function switchTab(tabKey) {
  qsa(".analytics-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabKey);
  });
  qsa(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabKey}`);
  });
  requestAnimationFrame(() => {
    if (state.miniChart) state.miniChart.resize();
    if (state.tabChart) state.tabChart.resize();
  });
}

function openModal(title, kicker = "Detail") {
  qs("#modalTitle").textContent = title;
  qs("#modalKicker").textContent = kicker;
  qs("#modalBackdrop").hidden = false;
  qs("#analyticsModal").hidden = false;
}

function closeModals() {
  qs("#modalBackdrop").hidden = true;
  qs("#analyticsModal").hidden = true;
  qs("#customerModal").hidden = true;
  if (state.activeChart) {
    state.activeChart.destroy();
    state.activeChart = null;
  }
}

function setTabs(tabs, activeKey, onSelect) {
  qs("#modalTabs").innerHTML = tabs.map((tab) => `
    <button class="modal-tab ${tab.key === activeKey ? "active" : ""}" type="button" data-tab="${tab.key}">
      ${escapeHtml(tab.label)}
    </button>
  `).join("");
  qsa(".modal-tab").forEach((button) => {
    button.addEventListener("click", () => onSelect(button.dataset.tab));
  });
}

function table(headers, rows, options = {}) {
  if (!rows.length) return `<div class="empty-state">No data for this period</div>`;
  return `
    <div class="table-wrap">
      <table class="analytics-table">
        <thead><tr>${headers.map((header) => `<th class="${header.num ? "num" : ""}">${escapeHtml(header.label)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `
          <tr class="${options.clickable ? "clickable" : ""}" ${row.dataset || ""}>
            ${headers.map((header) => `<td class="${header.num ? "num" : ""}">${row[header.key] ?? ""}</td>`).join("")}
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderRevenueModal(tab = "trend") {
  const data = state.revenueDetail;
  openModal("Revenue Detail", "Drill Down");
  setTabs([
    { key: "trend", label: "Trend" },
    { key: "customers", label: "Customers" },
    { key: "categories", label: "Categories" },
    { key: "top", label: "Top Customers" },
  ], tab, renderRevenueModal);

  if (state.activeChart) {
    state.activeChart.destroy();
    state.activeChart = null;
  }

  if (tab === "trend") {
    qs("#modalBody").innerHTML = `
      <div class="modal-grid">
        <div class="detail-card full">
          <h3>Daily Revenue</h3>
          <div class="modal-chart"><canvas id="modalRevenueChart"></canvas></div>
        </div>
        <div class="detail-card full">
          <h3>Daily Breakdown</h3>
          ${table([
            { key: "date", label: "Date" },
            { key: "revenue", label: "Revenue", num: true },
            { key: "bills", label: "Bills", num: true },
          ], data.daily_revenue.map((row) => ({
            date: escapeHtml(row.date),
            revenue: formatMoney(row.revenue),
            bills: formatNumber(row.bills),
          })))}
        </div>
      </div>`;
    state.activeChart = new Chart(qs("#modalRevenueChart"), {
      type: "bar",
      data: {
        labels: data.daily_revenue.map((row) => row.date),
        datasets: [{ label: "Revenue", data: data.daily_revenue.map((row) => row.revenue), backgroundColor: "#2563eb" }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: (value) => formatMoney(value) } } },
      },
    });
  }

  if (tab === "customers") {
    const renderCustomerRows = (customers) => customers.map((customer) => ({
      dataset: `data-customer-id="${customer.customer_id}"`,
      name: `<strong>${escapeHtml(customer.name)}</strong><br><span class="muted">${escapeHtml(customer.phone || "")}</span>`,
      revenue: formatMoney(customer.revenue),
      bills: formatNumber(customer.bills),
      category: escapeHtml(customer.category_preference || "-"),
      last: escapeHtml(customer.last_purchase || "-"),
    }));
    qs("#modalBody").innerHTML = `
      <div class="modal-grid">
        <div class="detail-card full">
          <h3>New Customers</h3>
          ${table([
            { key: "name", label: "Customer" },
            { key: "revenue", label: "Revenue", num: true },
            { key: "bills", label: "Bills", num: true },
            { key: "category", label: "Top Category" },
            { key: "last", label: "Last Purchase" },
          ], renderCustomerRows(data.by_customer_type.new.customers || []), { clickable: true })}
        </div>
        <div class="detail-card full">
          <h3>Repeat Customers</h3>
          ${table([
            { key: "name", label: "Customer" },
            { key: "revenue", label: "Revenue", num: true },
            { key: "bills", label: "Bills", num: true },
            { key: "category", label: "Top Category" },
            { key: "last", label: "Last Purchase" },
          ], renderCustomerRows(data.by_customer_type.repeat.customers || []), { clickable: true })}
        </div>
      </div>`;
    bindCustomerRows();
  }

  if (tab === "categories") {
    qs("#modalBody").innerHTML = table([
      { key: "category", label: "Category" },
      { key: "revenue", label: "Revenue", num: true },
      { key: "units", label: "Units", num: true },
      { key: "bills", label: "Bills", num: true },
      { key: "pct", label: "Share", num: true },
    ], data.by_category.map((row) => ({
      dataset: `data-category="${escapeHtml(row.category)}"`,
      category: `<strong>${escapeHtml(row.category)}</strong>`,
      revenue: formatMoney(row.revenue),
      units: formatNumber(row.units),
      bills: formatNumber(row.bills),
      pct: `${row.pct}%`,
    })), { clickable: true });
    qsa("[data-category]").forEach((row) => row.addEventListener("click", () => openCategory(row.dataset.category)));
  }

  if (tab === "top") {
    qs("#modalBody").innerHTML = table([
      { key: "name", label: "Customer" },
      { key: "revenue", label: "Revenue", num: true },
      { key: "bills", label: "Bills", num: true },
      { key: "type", label: "Type" },
      { key: "last", label: "Last Purchase" },
    ], data.top_customers.map((customer) => ({
      dataset: `data-customer-id="${customer.customer_id}"`,
      name: `<strong>${escapeHtml(customer.name)}</strong><br><span class="muted">${escapeHtml(customer.phone || "")}</span>`,
      revenue: formatMoney(customer.revenue),
      bills: formatNumber(customer.bills),
      type: customer.previous_purchases > 0 ? `<span class="badge">Repeat</span>` : `<span class="badge warn">New</span>`,
      last: escapeHtml(customer.last_purchase || "-"),
    })), { clickable: true });
    bindCustomerRows();
  }
}

async function openCategory(category) {
  openModal(category, "Category");
  qs("#modalTabs").innerHTML = "";
  qs("#modalBody").innerHTML = `<div class="empty-state">Loading...</div>`;
  const data = await fetchJson(`/analytics/api/category/${encodeURIComponent(category)}/detail?${params()}`);
  qs("#modalBody").innerHTML = `
    <div class="mini-kpis">
      <div><span>Revenue</span><strong>${formatMoney(data.revenue.total)}</strong></div>
      <div><span>Items</span><strong>${formatNumber(data.items.length)}</strong></div>
    </div>
    ${table([
      { key: "name", label: "Item" },
      { key: "units", label: "Units", num: true },
      { key: "revenue", label: "Revenue", num: true },
      { key: "margin", label: "Known Margin", num: true },
      { key: "marginPct", label: "Margin %", num: true },
    ], data.items.map((item) => ({
      name: escapeHtml(item.name),
      units: formatNumber(item.units),
      revenue: formatMoney(item.revenue),
      margin: formatMoney(item.margin),
      marginPct: `${item.margin_pct}%`,
    })))}
  `;
}

async function renderOutstandingModal() {
  openModal("Outstanding & Collections", "Ledger");
  qs("#modalTabs").innerHTML = "";
  qs("#modalBody").innerHTML = `<div class="empty-state">Loading...</div>`;
  const data = await fetchJson(`/analytics/api/outstanding/detail?${params()}`);
  _outstandingLoaded(data, "aging");
}

function _outstandingLoaded(data, activeTab) {
  setTabs([
    { key: "aging",   label: "Aging" },
    { key: "heatmap", label: "Recent Payments" },
  ], activeTab, (tab) => _outstandingLoaded(data, tab));

  if (activeTab === "aging") {
    renderOutstandingBody(data, "age_oldest", _outstandingMode);
  } else {
    renderPaymentHeatmap(data.recent_payments);
  }
}

async function renderSlowItemsModal(cutoffDays = 30, minPrice = 0, catFilter = "all") {
  openModal("Slow & Costly Items", "Inventory");
  qs("#modalTabs").innerHTML = "";
  qs("#modalBody").innerHTML = `<div class="empty-state">Loading...</div>`;
  _slowItemsData = await fetchJson(`/analytics/api/items/slow-moving?${params()}&days=${cutoffDays}`);
  renderSlowItemsBody(_slowItemsData, cutoffDays, minPrice, catFilter);
}

function renderSlowItemsBody(data, cutoffDays, minPrice, catFilter) {
  // Build sorted unique category list from the full (unfiltered) data
  const allCategories = ["all", ...[...new Set(data.items.map((i) => i.category || "Uncategorised"))].sort()];

  // Client-side filters
  let items = [...data.items];
  if (minPrice > 0)        items = items.filter((i) => (i.default_price || 0) >= minPrice);
  if (catFilter !== "all") items = items.filter((i) => (i.category || "Uncategorised") === catFilter);

  // Build 2-D cell map: pBand.key → sBand.key → [items]
  const cellMap = {};
  for (const pb of SLOW_PRICE_BANDS) {
    cellMap[pb.key] = {};
    for (const sb of SLOW_STALE_BANDS) cellMap[pb.key][sb.key] = [];
  }
  for (const item of items) {
    const price = item.default_price || 0;
    const days  = item.days_since_sale;           // null = never sold
    const pb = SLOW_PRICE_BANDS.find((b) => price >= b.min && price < b.max);
    const sb = SLOW_STALE_BANDS.find((b) => b.test(days));
    if (pb && sb) cellMap[pb.key][sb.key].push(item);
  }

  // Normalise for heat intensity
  let maxCount = 1;
  for (const pk of Object.keys(cellMap))
    for (const sk of Object.keys(cellMap[pk]))
      if (cellMap[pk][sk].length > maxCount) maxCount = cellMap[pk][sk].length;

  function heatClass(count) {
    if (!count) return "heat-0";
    const r = count / maxCount;
    if (r < 0.2)  return "heat-s1";
    if (r < 0.45) return "heat-s2";
    if (r < 0.7)  return "heat-s3";
    return "heat-s4";
  }

  const totalListValue = items.reduce((s, i) => s + (i.default_price || 0), 0);

  const headerCells = SLOW_STALE_BANDS
    .map((b) => `<th class="hm-col-head">${escapeHtml(b.label)}</th>`).join("");

  const bodyRows = SLOW_PRICE_BANDS.map((pb) => {
    const dataCells = SLOW_STALE_BANDS.map((sb) => {
      const cellItems  = cellMap[pb.key][sb.key];
      const count      = cellItems.length;
      const listVal    = cellItems.reduce((s, i) => s + (i.default_price || 0), 0);
      return `
        <td class="heatmap-cell ${heatClass(count)}"
            data-pband="${escapeHtml(pb.key)}"
            data-sband="${escapeHtml(sb.key)}"
            title="${count} item${count !== 1 ? 's' : ''} · ${formatMoney(listVal)} list value">
          <strong>${count}</strong>
          <span>${count ? formatMoney(listVal) : "—"}</span>
        </td>`;
    }).join("");
    return `<tr><td class="hm-band-label">${escapeHtml(pb.label)}</td>${dataCells}</tr>`;
  }).join("");

  qs("#modalBody").innerHTML = `
    <div class="slow-filters">
      <div class="slow-filter-group">
        <label for="slowCutoff">Cutoff (days not sold)</label>
        <select id="slowCutoff">
          ${[15, 30, 45, 60, 90, 120, 180].map((d) =>
            `<option value="${d}" ${d === cutoffDays ? "selected" : ""}>${d} days</option>`
          ).join("")}
        </select>
      </div>
      <div class="slow-filter-group">
        <label for="slowMinPrice">Min list price</label>
        <select id="slowMinPrice">
          <option value="0"    ${minPrice === 0    ? "selected" : ""}>Any price</option>
          <option value="100"  ${minPrice === 100  ? "selected" : ""}>Rs 100+</option>
          <option value="500"  ${minPrice === 500  ? "selected" : ""}>Rs 500+</option>
          <option value="1000" ${minPrice === 1000 ? "selected" : ""}>Rs 1,000+</option>
          <option value="2000" ${minPrice === 2000 ? "selected" : ""}>Rs 2,000+</option>
          <option value="5000" ${minPrice === 5000 ? "selected" : ""}>Rs 5,000+</option>
        </select>
      </div>
      <div class="slow-filter-group">
        <label for="slowCategory">Category</label>
        <select id="slowCategory">
          ${allCategories.map((c) =>
            `<option value="${escapeHtml(c)}" ${c === catFilter ? "selected" : ""}>${escapeHtml(c === "all" ? "All categories" : c)}</option>`
          ).join("")}
        </select>
      </div>
    </div>
    <div class="mini-kpis hm-summary">
      <div><span>Matching Items</span><strong>${formatNumber(items.length)}</strong></div>
      <div><span>Cutoff Applied</span><strong>${cutoffDays}+ days</strong></div>
      <div><span>Total List Value</span><strong>${formatMoney(totalListValue)}</strong></div>
    </div>
    <p class="hm-hint">Price ↓ vs staleness →. Click any cell to see items sorted by highest price first.</p>
    <div class="heatmap-wrap">
      <table class="heatmap-table">
        <thead>
          <tr>
            <th class="hm-corner">Price&nbsp;↓&nbsp;/&nbsp;Stale&nbsp;→</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div id="slowItemDetail" class="heatmap-detail" hidden></div>
  `;

  // Cutoff change → re-fetch + re-render
  qs("#slowCutoff").addEventListener("change", (e) => {
    const newCutoff   = Number(e.target.value);
    const newMinPrice = Number(qs("#slowMinPrice").value);
    const newCat      = qs("#slowCategory").value;
    qs("#modalBody").innerHTML = `<div class="empty-state">Loading...</div>`;
    fetchJson(`/analytics/api/items/slow-moving?${params()}&days=${newCutoff}`)
      .then((fresh) => { _slowItemsData = fresh; renderSlowItemsBody(fresh, newCutoff, newMinPrice, newCat); });
  });

  // Price/category changes → client-side re-filter only
  qs("#slowMinPrice").addEventListener("change", (e) => {
    renderSlowItemsBody(_slowItemsData, cutoffDays, Number(e.target.value), qs("#slowCategory").value);
  });
  qs("#slowCategory").addEventListener("change", (e) => {
    renderSlowItemsBody(_slowItemsData, cutoffDays, Number(qs("#slowMinPrice").value), e.target.value);
  });

  // Cell click → expand detail sorted by price DESC
  qsa(".heatmap-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const pb         = cell.dataset.pband;
      const sb         = cell.dataset.sband;
      const cellItems  = cellMap[pb]?.[sb] || [];
      const pLabel     = SLOW_PRICE_BANDS.find((b) => b.key === pb)?.label || pb;
      const sLabel     = SLOW_STALE_BANDS.find((b) => b.key === sb)?.label || sb;
      const detail     = qs("#slowItemDetail");

      const wasSelected = cell.classList.contains("selected");
      qsa(".heatmap-cell").forEach((c) => c.classList.remove("selected"));
      if (wasSelected) { detail.hidden = true; return; }

      cell.classList.add("selected");

      if (!cellItems.length) {
        detail.innerHTML = `<div class="empty-state">No items in this segment.</div>`;
      } else {
        const sorted   = [...cellItems].sort((a, b) => (b.default_price || 0) - (a.default_price || 0));
        const listVal  = sorted.reduce((s, i) => s + (i.default_price || 0), 0);
        detail.innerHTML = `
          <div class="hm-detail-header">
            <span class="hm-detail-badge slow">${escapeHtml(pLabel)}</span>
            <span class="hm-detail-badge secondary">${escapeHtml(sLabel)}</span>
            <span class="hm-detail-meta">${sorted.length} item${sorted.length !== 1 ? 's' : ''} &middot; ${formatMoney(listVal)} list value &middot; sorted by price</span>
          </div>
          ${table(
            [
              { key: "name",     label: "Item" },
              { key: "category", label: "Category" },
              { key: "price",    label: "List Price",  num: true },
              { key: "cost",     label: "Known Cost",  num: true },
              { key: "last",     label: "Last Sale" },
              { key: "days",     label: "Days Stale",  num: true },
            ],
            sorted.map((item) => ({
              name:     escapeHtml(item.name),
              category: escapeHtml(item.category || "-"),
              price:    formatMoney(item.default_price),
              cost:     item.cost_price == null
                          ? `<span class="muted">—</span>`
                          : formatMoney(item.cost_price),
              last:     escapeHtml(item.last_sale_date || "Never"),
              days:     item.days_since_sale == null
                          ? `<span class="muted">Never sold</span>`
                          : formatNumber(item.days_since_sale),
            }))
          )}`;
      }

      detail.hidden = false;
      detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}

function renderMarginModal() {
  const margin = state.summary.margin;
  openModal("Known-Cost Margin", "Cost Filtered");
  qs("#modalTabs").innerHTML = "";
  qs("#modalBody").innerHTML = `
    <div class="mini-kpis">
      <div><span>Costed Revenue</span><strong>${formatMoney(margin.costed_revenue)}</strong></div>
      <div><span>Known Cost</span><strong>${formatMoney(margin.known_cost)}</strong></div>
      <div><span>Gross Margin</span><strong>${formatMoney(margin.gross_margin)}</strong></div>
      <div><span>Margin %</span><strong>${margin.margin_pct}%</strong></div>
    </div>
    <div class="empty-state">${escapeHtml(margin.note)}</div>
  `;
}

function bindCustomerRows() {
  qsa("[data-customer-id]").forEach((row) => {
    row.addEventListener("click", () => openCustomer(row.dataset.customerId));
  });
}

function agingBucketRank(bucketName) {
  if (bucketName.startsWith("90+")) return 91;
  const match = bucketName.match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}

function sortAgingBuckets(buckets, sortKey) {
  const rows = [...buckets];
  if (sortKey === "age_newest") {
    return rows.sort((a, b) => agingBucketRank(a.bucket) - agingBucketRank(b.bucket));
  }
  if (sortKey === "amount_high") {
    return rows.sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
  }
  if (sortKey === "amount_low") {
    return rows.sort((a, b) => Number(a.total || 0) - Number(b.total || 0));
  }
  if (sortKey === "customers_high") {
    return rows.sort((a, b) => (b.customers || []).length - (a.customers || []).length);
  }
  return rows.sort((a, b) => agingBucketRank(b.bucket) - agingBucketRank(a.bucket));
}

function renderOutstandingBody(data, sortKey = "age_oldest", outstandingMode = "total") {
  const sortedBuckets = sortAgingBuckets(data.aging_buckets || [], sortKey);

  const isTotal  = outstandingMode === "total";
  const kpiValue = isTotal ? data.total_outstanding : data.period_outstanding;
  const kpiLabel = isTotal ? "Total Outstanding" : "Period Outstanding";
  const kpiSub   = isTotal
    ? "All-time ledger balance"
    : `${formatMoney(data.period_revenue)} revenue − ${formatMoney(data.period_payments)} payments`;

  const periodLabel = data.period
    ? `${data.period.start} to ${data.period.end}`
    : "Selected period";

  qs("#modalBody").innerHTML = `
    <div class="mini-kpis outstanding-kpis">
      <div class="outstanding-kpi-main">
        <div class="outstanding-toggle-wrap">
          <span class="outstanding-kpi-label">${kpiLabel}</span>
          <button
            id="outstandingModeBtn"
            class="outstanding-mode-toggle ${isTotal ? "mode-total" : "mode-period"}"
            title="Switch between all-time and period outstanding"
            aria-pressed="${!isTotal}"
          >
            <span class="toggle-pill">
              <span class="toggle-option ${isTotal ? "active" : ""}">All-time</span>
              <span class="toggle-option ${!isTotal ? "active" : ""}">Period</span>
            </span>
          </button>
        </div>
        <strong class="outstanding-kpi-value">${formatMoney(kpiValue)}</strong>
        <small class="outstanding-kpi-sub">${escapeHtml(kpiSub)}</small>
      </div>
      <div><span>Period</span><strong>${escapeHtml(periodLabel)}</strong></div>
      <div><span>Aging Basis</span><strong>Ledger</strong></div>
    </div>
    <div class="modal-tools">
      <label for="agingSort">Sort credit age tiles</label>
      <select id="agingSort">
        <option value="age_oldest" ${sortKey === "age_oldest" ? "selected" : ""}>Oldest age first</option>
        <option value="age_newest" ${sortKey === "age_newest" ? "selected" : ""}>Newest age first</option>
        <option value="amount_high" ${sortKey === "amount_high" ? "selected" : ""}>Highest outstanding first</option>
        <option value="amount_low" ${sortKey === "amount_low" ? "selected" : ""}>Lowest outstanding first</option>
        <option value="customers_high" ${sortKey === "customers_high" ? "selected" : ""}>Most customers first</option>
      </select>
    </div>
    ${sortedBuckets.map((bucket) => `
      <div class="detail-card full">
        <h3>${escapeHtml(bucket.bucket)} - ${formatMoney(bucket.total)}</h3>
        ${table([
          { key: "name", label: "Customer" },
          { key: "outstanding", label: "Outstanding", num: true },
          { key: "days", label: "Days Open", num: true },
          { key: "oldest", label: "Oldest Activity" },
        ], bucket.customers.map((customer) => ({
          dataset: `data-customer-id="${customer.customer_id}"`,
          name: `<strong>${escapeHtml(customer.name)}</strong><br><span class="muted">${escapeHtml(customer.phone || "")}</span>`,
          outstanding: formatMoney(customer.outstanding),
          days: formatNumber(customer.days_open),
          oldest: escapeHtml(customer.oldest_activity || "-"),
        })), { clickable: true })}
      </div>
    `).join("")}
    <p class="muted">${escapeHtml(data.note)}</p>
  `;

  qs("#outstandingModeBtn").addEventListener("click", () => {
    _outstandingMode = _outstandingMode === "total" ? "period" : "total";
    _renderOutstandingTile();                          // keep tile in sync
    renderOutstandingBody(data, sortKey, _outstandingMode);
  });
  qs("#agingSort").addEventListener("change", (event) => {
    renderOutstandingBody(data, event.target.value, outstandingMode);
  });
  bindCustomerRows();
}

// ─────────────────────────────────────────────────────────
// PAYMENT HEATMAP  (Recent Payments tab)
// ─────────────────────────────────────────────────────────
function renderPaymentHeatmap(heatmap) {
  if (!heatmap) {
    qs("#modalBody").innerHTML = `<div class="empty-state">No payment data available for this period.</div>`;
    return;
  }

  const { basis, bands, recency, cells } = heatmap;

  // Normalise counts so we can assign heat-intensity CSS classes
  let maxCount = 1;
  for (const band of bands) {
    for (const bucket of recency) {
      const count = cells[band.key]?.[bucket.key]?.count || 0;
      if (count > maxCount) maxCount = count;
    }
  }

  function heatClass(count) {
    if (!count) return "heat-0";
    const r = count / maxCount;
    if (r < 0.2)  return "heat-1";
    if (r < 0.45) return "heat-2";
    if (r < 0.7)  return "heat-3";
    return "heat-4";
  }

  const headerCells = recency
    .map((r) => `<th class="hm-col-head">${escapeHtml(r.label)}</th>`)
    .join("");

  const bodyRows = bands
    .map((band) => {
      const dataCells = recency
        .map((bucket) => {
          const cell = cells[band.key]?.[bucket.key] || { count: 0, total: 0, payments: [] };
          return `
            <td class="heatmap-cell ${heatClass(cell.count)}"
                data-band="${escapeHtml(band.key)}"
                data-recency="${escapeHtml(bucket.key)}"
                title="${cell.count} payment${cell.count !== 1 ? "s" : ""} · ${formatMoney(cell.total)}">
              <strong>${cell.count}</strong>
              <span>${cell.count ? formatMoney(cell.total) : "—"}</span>
            </td>`;
        })
        .join("");
      return `<tr><td class="hm-band-label">${escapeHtml(band.label)}</td>${dataCells}</tr>`;
    })
    .join("");

  qs("#modalBody").innerHTML = `
    <div class="mini-kpis hm-summary">
      <div><span>Heatmap Basis</span><strong>${escapeHtml(basis)}</strong></div>
      <div><span>Window</span><strong>Last 30 days</strong></div>
    </div>
    <p class="hm-hint">Click any cell to expand individual payments below the grid.</p>
    <div class="heatmap-wrap">
      <table class="heatmap-table">
        <thead>
          <tr>
            <th class="hm-corner">Amount&nbsp;↓&nbsp;/&nbsp;When&nbsp;→</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div id="heatmapDetail" class="heatmap-detail" hidden></div>
  `;

  // Wire cell click → expand detail panel
  qsa(".heatmap-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const bandKey     = cell.dataset.band;
      const recencyKey  = cell.dataset.recency;
      const cellData    = cells[bandKey]?.[recencyKey] || { count: 0, total: 0, payments: [] };
      const bandLabel   = bands.find((b) => b.key === bandKey)?.label   || bandKey;
      const recLabel    = recency.find((r) => r.key === recencyKey)?.label || recencyKey;
      const detail      = qs("#heatmapDetail");

      // Toggle off if the same cell is clicked again
      const wasSelected = cell.classList.contains("selected");
      qsa(".heatmap-cell").forEach((c) => c.classList.remove("selected"));

      if (wasSelected) {
        detail.hidden = true;
        return;
      }

      cell.classList.add("selected");

      if (!cellData.payments.length) {
        detail.innerHTML = `<div class="empty-state">No payments in this band.</div>`;
      } else {
        detail.innerHTML = `
          <div class="hm-detail-header">
            <span class="hm-detail-badge">${escapeHtml(bandLabel)}</span>
            <span class="hm-detail-badge secondary">${escapeHtml(recLabel)}</span>
            <span class="hm-detail-meta">${cellData.count} payment${cellData.count !== 1 ? "s" : ""} &middot; ${formatMoney(cellData.total)} total</span>
          </div>
          ${table(
            [
              { key: "customer", label: "Customer" },
              { key: "amount",   label: "Amount",  num: true },
              { key: "method",   label: "Method" },
              { key: "date",     label: "Date" },
              { key: "notes",    label: "Notes" },
            ],
            cellData.payments.map((p) => ({
              dataset:  p.customer_id ? `data-customer-id="${p.customer_id}"` : "",
              customer: `<strong>${escapeHtml(p.customer_name || "Walk-in")}</strong><br><span class="muted">${escapeHtml(p.phone || "")}</span>`,
              amount:   formatMoney(p.amount),
              method:   escapeHtml(p.method || "-"),
              date:     escapeHtml(p.date   || "-"),
              notes:    escapeHtml(p.notes  || ""),
            })),
            { clickable: true }
          )}`;
        bindCustomerRows();
      }

      detail.hidden = false;
      detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}

async function openCustomer(customerId) {
  qs("#analyticsModal").hidden = true;
  qs("#modalTabs").innerHTML = "";
  qs("#modalBody").innerHTML = "";
  if (state.activeChart) {
    state.activeChart.destroy();
    state.activeChart = null;
  }
  qs("#modalBackdrop").hidden = false;
  qs("#customerModal").hidden = false;
  qs("#customerModalTitle").textContent = "Customer Profile";
  qs("#customerModalBody").innerHTML = `<div class="empty-state">Loading...</div>`;
  const data = await fetchJson(`/analytics/api/customer/${customerId}/profile`);
  const customer = data.customer;
  const summary = data.summary;
  qs("#customerModalTitle").textContent = customer.name;
  qs("#customerModalBody").innerHTML = `
    <div class="mini-kpis">
      <div><span>Total Spent</span><strong>${formatMoney(summary.total_spent)}</strong></div>
      <div><span>Outstanding</span><strong>${formatMoney(summary.outstanding)}</strong></div>
      <div><span>Bills</span><strong>${formatNumber(summary.bills_count)}</strong></div>
      <div><span>Repeat</span><strong>${summary.is_repeat ? "Yes" : "No"}</strong></div>
    </div>
    <div class="modal-actions">
      <a class="btn-ghost" href="/customers/${customer.id}/ledger">Open Ledger</a>
    </div>
    <div class="modal-grid">
      <div class="detail-card">
        <h3>Profile</h3>
        <p><strong>Phone:</strong> ${escapeHtml(customer.phone || "-")}</p>
        <p><strong>Type:</strong> ${escapeHtml(customer.customer_type || "-")}</p>
        <p><strong>Address:</strong> ${escapeHtml(customer.address || customer.village || "-")}</p>
      </div>
      <div class="detail-card">
        <h3>Dates</h3>
        <p><strong>First purchase:</strong> ${escapeHtml(summary.first_purchase || "-")}</p>
        <p><strong>Last purchase:</strong> ${escapeHtml(summary.last_purchase || "-")}</p>
      </div>
      <div class="detail-card full">
        <h3>Recent Purchases</h3>
        ${table([
          { key: "bill", label: "Bill" },
          { key: "date", label: "Date" },
          { key: "amount", label: "Amount", num: true },
          { key: "items", label: "Items", num: true },
          { key: "categories", label: "Categories" },
        ], data.purchases.map((purchase) => ({
          bill: `<a class="ref-link" href="/bills/${purchase.bill_id}">#${purchase.bill_id}</a>`,
          date: escapeHtml(purchase.date || "-"),
          amount: formatMoney(purchase.amount),
          items: formatNumber(purchase.items_count),
          categories: escapeHtml((purchase.categories || []).join(", ") || "-"),
        })))}
      </div>
      <div class="detail-card full">
        <h3>Recent Payments</h3>
        ${table([
          { key: "date", label: "Date" },
          { key: "amount", label: "Amount", num: true },
          { key: "method", label: "Method" },
        ], data.payments.map((payment) => ({
          date: escapeHtml(payment.date || "-"),
          amount: formatMoney(payment.amount),
          method: escapeHtml(payment.method || "-"),
        })))}
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────
// REFERRAL ANALYTICS
// ─────────────────────────────────────────────────────────

function renderReferralSummary(data) {
  if (!data) return;
  const kpis = data.kpis || {};
  setText("#refKpiReferrers", formatNumber(kpis.total_referrers));
  setText("#refKpiCustomers", formatNumber(kpis.referred_customers));
  setText("#refKpiRevenue", kpis.referral_revenue);
  setText("#refKpiShare", `${kpis.referral_share_pct}%`);
  setText("#refKpiAvgRev", kpis.avg_revenue_per_referral);
  setText("#refKpiTop", kpis.top_referrer ? `${escapeHtml(kpis.top_referrer.name)} (${kpis.top_referrer.revenue})` : "-");

  const funnel = data.funnel || {};
  setText("#refFunnelReferred", formatNumber(funnel.referred));
  setText("#refFunnelPurchase", formatNumber(funnel.made_purchase));
  setText("#refFunnelPurchasePct", `${funnel.conversion_to_purchase_pct}%`);
  setText("#refFunnelRepeat", formatNumber(funnel.repeat));
  setText("#refFunnelRepeatPct", `${funnel.conversion_to_repeat_pct}%`);

  const qual = data.quality_comparison || {};
  setText("#refQualAvgBill", `${qual.referred?.avg_bill || 0} vs ${qual.non_referred?.avg_bill || 0}`);
  setText("#refQualRepeat", `${qual.referred?.repeat_rate || 0}% vs ${qual.non_referred?.repeat_rate || 0}%`);
  setText("#refQualFreq", `${qual.referred?.avg_purchase_freq || 0} vs ${qual.non_referred?.avg_purchase_freq || 0}`);

  const health = data.health || {};
  setText("#refHealthInactive", formatNumber(health.inactive));
  setText("#refHealthDormant", formatNumber(health.dormant));
  setText("#refHealthHighValue", formatNumber(health.high_value));

  renderReferralTrendChart(data.trend || []);
  renderReferralVillageChart(data.village_stats || []);
  renderReferralPieChart(data.funnel || {});
}

function renderReferralPieChart(funnel) {
  const ctx = qs("#referralPieChart");
  if (!ctx || !window.Chart) return;
  
  if (state.refPieChart) state.refPieChart.destroy();
  
  const repeat = funnel.repeat || 0;
  const oneTime = (funnel.made_purchase || 0) - repeat;
  
  state.refPieChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Repeat (2+ purchases)", "One-time"],
      datasets: [{
        data: [repeat, oneTime],
        backgroundColor: ["#10b981", "#fbbf24"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "60%",
      plugins: {
        legend: { position: "right" }
      }
    }
  });
}

function renderReferralTrendChart(trendData) {
  const ctx = qs("#referralTrendChart");
  if (!ctx || !window.Chart) return;
  
  if (state.refTrendChart) state.refTrendChart.destroy();
  
  state.refTrendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: trendData.map(d => d.month),
      datasets: [
        {
          label: "New Referred Customers",
          data: trendData.map(d => d.new_customers),
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          yAxisID: "y"
        },
        {
          label: "Referral Revenue",
          data: trendData.map(d => Number(String(d.revenue).replace(/[^0-9.-]+/g,""))),
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { type: "linear", position: "left", title: { display: true, text: "Customers" } },
        y1: { type: "linear", position: "right", title: { display: true, text: "Revenue" }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

function renderReferralVillageChart(villageData) {
  const ctx = qs("#referralVillageChart");
  if (!ctx || !window.Chart) return;
  
  if (state.refVillageChart) state.refVillageChart.destroy();
  
  state.refVillageChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: villageData.map(d => escapeHtml(d.village)),
      datasets: [{
        label: "Revenue",
        data: villageData.map(d => Number(String(d.revenue).replace(/[^0-9.-]+/g,""))),
        backgroundColor: "#6366f1"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    }
  });
}

function renderReferralLeaderboard(data) {
  const tbody = qs("#referralLeaderboardBody");
  if (!tbody || !data || !data.leaderboard) return;
  
  if (data.leaderboard.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No referrers found.</td></tr>`;
    return;
  }
  
  tbody.innerHTML = data.leaderboard.map(row => `
    <tr class="clickable-row" data-id="${row.referrer_id}">
      <td><strong>${escapeHtml(row.referrer_name)}</strong></td>
      <td>${escapeHtml(row.village)}</td>
      <td class="right-align">${formatNumber(row.referral_count)}</td>
      <td class="right-align">${escapeHtml(row.referral_revenue)}</td>
      <td class="right-align">${formatNumber(row.bill_count)}</td>
      <td class="right-align">${escapeHtml(row.avg_bill)}</td>
      <td class="right-align">${escapeHtml(row.outstanding)}</td>
    </tr>
  `).join("");
  
  qsa("#referralLeaderboardBody .clickable-row").forEach(row => {
    row.addEventListener("click", () => openReferralModal(row.dataset.id));
  });
}

async function openReferralModal(referrerId) {
  const modal = qs("#referralModal");
  const backdrop = qs("#modalBackdrop");
  const body = qs("#referralModalBody");
  const title = qs("#referralModalTitle");
  
  if (!modal || !body) return;
  
  title.textContent = "Loading...";
  body.innerHTML = `<div class="loading-cell" style="padding:2rem;">Fetching details...</div>`;
  
  modal.hidden = false;
  backdrop.hidden = false;
  
  try {
    const data = await fetchJson(`/analytics/api/referral/detail/${referrerId}?${params()}`);
    title.textContent = data.header.name || "Referrer";
    
    body.innerHTML = `
      <div class="mini-kpis">
        <div><span>Village</span><strong>${escapeHtml(data.header.village)}</strong></div>
        <div><span>Code</span><strong>${escapeHtml(data.header.referral_code)}</strong></div>
        <div><span>Referrals</span><strong>${formatNumber(data.header.total_referrals)}</strong></div>
        <div><span>Repeat</span><strong>${formatNumber(data.header.repeat_customers)}</strong></div>
        <div><span>Revenue</span><strong>${escapeHtml(data.header.revenue)}</strong></div>
        <div><span>Avg Bill</span><strong>${escapeHtml(data.header.avg_bill)}</strong></div>
        <div><span>Outstanding</span><strong>${escapeHtml(data.header.outstanding)}</strong></div>
      </div>
      
      <h3 style="margin: 1.5rem 0 0.5rem; font-size: 13px;">Referred Customers</h3>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Village</th>
              <th>Type</th>
              <th class="right-align">Bills</th>
              <th class="right-align">Revenue</th>
              <th class="right-align">Outstanding</th>
              <th class="right-align">Last Purchase</th>
            </tr>
          </thead>
          <tbody>
            ${data.customers.length === 0 ? `<tr><td colspan="7">No customers referred.</td></tr>` : 
              data.customers.map(c => `
                <tr>
                  <td><strong>${escapeHtml(c.name)}</strong></td>
                  <td>${escapeHtml(c.village)}</td>
                  <td>${escapeHtml(c.customer_type)}</td>
                  <td class="right-align">${formatNumber(c.bills)}</td>
                  <td class="right-align">${escapeHtml(c.revenue)}</td>
                  <td class="right-align">${escapeHtml(c.outstanding)}</td>
                  <td class="right-align">${escapeHtml(c.last_purchase)}</td>
                </tr>
              `).join("")
            }
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="empty-state">Error loading details: ${escapeHtml(err.message)}</div>`;
  }
}

function handleModalRequest(type) {
  if (type === "revenue") renderRevenueModal();
  if (type === "outstanding") renderOutstandingModal();
  if (type === "slow-items") renderSlowItemsModal();
  if (type === "margin") renderMarginModal();
}

function bindEvents() {
  const tileToggle = qs("#outstandingTileToggle");
  if (tileToggle) {
    tileToggle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();   // prevent bubble to card → modal handler
    });
    tileToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      // Read the mode from the pill that was clicked (or its parent toggle span)
      const opt = e.target.closest(".tile-toggle-opt");
      if (opt && opt.dataset.mode) {
        _outstandingMode = opt.dataset.mode;
      } else {
        // Clicked the toggle container itself — flip
        _outstandingMode = _outstandingMode === "total" ? "period" : "total";
      }
      _renderOutstandingTile();
    });
  }

  qsa(".info-dot").forEach((dot) => {
    dot.addEventListener("click", (event) => event.stopPropagation());
    dot.addEventListener("pointerdown", (event) => event.stopPropagation());
  });
  qs("#periodSelect").addEventListener("change", (event) => {
    state.period = event.target.value;
    const custom = state.period === "custom";
    qs("#startDate").hidden = !custom;
    qs("#endDate").hidden = !custom;
  });
  qs("#startDate").addEventListener("change", (event) => { state.startDate = event.target.value; });
  qs("#endDate").addEventListener("change", (event) => { state.endDate = event.target.value; });
  qs("#refreshBtn").addEventListener("click", loadDashboard);
  qsa("[data-modal]").forEach((button) => {
    button.addEventListener("click", () => handleModalRequest(button.dataset.modal));
  });
  qsa("[data-tab-target]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tabTarget));
  });
  qsa(".analytics-tab").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
  qs("#modalClose").addEventListener("click", closeModals);
  qs("#customerModalClose").addEventListener("click", () => {
    qs("#customerModal").hidden = true;
    qs("#modalBackdrop").hidden = true;
  });
  const referralModalClose = qs("#referralModalClose");
  if (referralModalClose) {
    referralModalClose.addEventListener("click", () => {
      qs("#referralModal").hidden = true;
      qs("#modalBackdrop").hidden = true;
    });
  }
  qs("#modalBackdrop").addEventListener("click", closeModals);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModals();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadDashboard();
});

const state = {
  period: "this_month",
  startDate: "",
  endDate: "",
  summary: null,
  revenueDetail: null,
  activeChart: null,
  miniChart: null,
  tabChart: null,
};

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
    const [summary, revenueDetail] = await Promise.all([
      fetchJson(`/analytics/api/summary?${params()}`),
      fetchJson(`/analytics/api/revenue/detail?${params()}`),
    ]);
    state.summary = summary;
    state.revenueDetail = revenueDetail;
    renderSummary(summary);
    renderMiniChart(revenueDetail.daily_revenue || []);
    renderRevenueTabChart(revenueDetail.daily_revenue || []);
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
  setText("#kpiOutstanding", formatMoney(data.cash.outstanding));
  setText("#kpiOutstandingPct", `${data.cash.outstanding_pct}% of revenue`);
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
  openModal("Outstanding Debt", "Ledger");
  qs("#modalTabs").innerHTML = "";
  qs("#modalBody").innerHTML = `<div class="empty-state">Loading...</div>`;
  const data = await fetchJson(`/analytics/api/outstanding/detail?${params()}`);
  qs("#modalBody").innerHTML = `
    <div class="mini-kpis">
      <div><span>Total Outstanding</span><strong>${formatMoney(data.total_outstanding)}</strong></div>
      <div><span>Aging Basis</span><strong>Ledger</strong></div>
    </div>
    ${data.aging_buckets.map((bucket) => `
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
  bindCustomerRows();
}

async function renderSlowItemsModal() {
  openModal("Slow Items", "Inventory");
  qs("#modalTabs").innerHTML = "";
  qs("#modalBody").innerHTML = `<div class="empty-state">Loading...</div>`;
  const data = await fetchJson(`/analytics/api/items/slow-moving?${params()}&days=30`);
  qs("#modalBody").innerHTML = `
    <div class="mini-kpis">
      <div><span>Total Slow Items</span><strong>${formatNumber(data.total_slow_items)}</strong></div>
      <div><span>Cutoff</span><strong>${data.cutoff_days}+ days</strong></div>
    </div>
    ${table([
      { key: "name", label: "Item" },
      { key: "category", label: "Category" },
      { key: "price", label: "Default Price", num: true },
      { key: "cost", label: "Known Cost", num: true },
      { key: "last", label: "Last Sale" },
      { key: "days", label: "Days", num: true },
    ], data.items.map((item) => ({
      name: escapeHtml(item.name),
      category: escapeHtml(item.category),
      price: formatMoney(item.default_price),
      cost: item.cost_price == null ? `<span class="muted">Ignored</span>` : formatMoney(item.cost_price),
      last: escapeHtml(item.last_sale_date || "Never"),
      days: item.days_since_sale == null ? "-" : formatNumber(item.days_since_sale),
    })))}
  `;
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

function handleModalRequest(type) {
  if (type === "revenue") renderRevenueModal();
  if (type === "outstanding") renderOutstandingModal();
  if (type === "slow-items") renderSlowItemsModal();
  if (type === "margin") renderMarginModal();
}

function bindEvents() {
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
  qs("#modalBackdrop").addEventListener("click", closeModals);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModals();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadDashboard();
});

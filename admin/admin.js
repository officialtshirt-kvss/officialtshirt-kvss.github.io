/* ============================================================================
 *  KEGALU VIDYALAYA SCIENCE SOCIETY — SHIRT DROP 2026 · ADMIN FRONTEND
 *  Paste your Apps Script /exec URL below, then host this folder anywhere.
 * ==========================================================================*/

const API_URL = "https://script.google.com/macros/s/AKfycbyy_rXJ6-SjDMygKjv52IUainQFIeaNj1-vfokaBSfi_5zYRXTfLQLVoW1rJXsCyh7AyQ/exec";

const TOKEN_KEY = "kvss_admin_token";
const DESIGN_PRICES = { "Design 01": 2200, "Design 02": 2500 };
const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const BATCH_OPTIONS = ["2026 Batch", "2027 Batch"];

let state = { token: null, admin: null, cache: { dashboard: null, orders: null, slips: null } };
let authBusy = false;
let navSeq = 0;
let currentView = "dashboard";

/* --------------------------- skeleton helpers ---------------------------- */

function sk(w, h, cls) {
  return '<div class="sk ' + (cls || "") + '" style="' + (w ? "width:" + w + ";" : "") + (h ? "height:" + h + ";" : "") + '"></div>';
}
function skLine(w) { return '<div class="sk sk-line" style="width:' + (w || "100%") + '"></div>'; }
function skCircle(s) { return '<div class="sk sk-circle" style="width:' + s + ";height:" + s + '"></div>'; }
function skRows(n, cols) {
  let row = "<tr>";
  const widths = ["90%", "75%", "65%", "55%", "80%"];
  for (let i = 0; i < cols; i++) row += "<td>" + skLine(widths[i % widths.length]) + "</td>";
  row += "</tr>";
  return Array(n).fill(row).join("");
}
function statSkeleton(n) {
  let out = "";
  for (let i = 0; i < n; i++) {
    out += '<div class="stat-card"><div class="sk sk-line" style="width:60%"></div>' +
      '<div class="sk" style="width:55%;height:26px"></div><div class="sk sk-line" style="width:70%"></div></div>';
  }
  return out;
}
function setContentBusy(busy) {
  $("#content").setAttribute("aria-busy", busy ? "true" : "false");
}
function showSectionError() {
  $$(".view").forEach(function (v) { v.hidden = true; });
  $("#section-error").hidden = false;
  setContentBusy(false);
}
function btnBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.orig = btn.textContent; btn.disabled = true; btn.textContent = label || "…"; }
  else { btn.disabled = false; btn.textContent = btn.dataset.orig || btn.textContent; }
}

/* ------------------------------- utils ---------------------------------- */

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function money(n) { return "LKR " + (Number(n) || 0).toLocaleString("en-US"); }
function fmtDate(ts) { return String(ts || "").slice(0, 10); }
function fmtTime(ts) { return String(ts || "").slice(11, 16); }

function sizeOptions(selected) {
  return SHIRT_SIZES.map(function (s) {
    return '<option' + (s === selected ? " selected" : "") + '>' + s + '</option>';
  }).join("");
}

function batchOptions(selected) {
  return BATCH_OPTIONS.map(function (b) {
    return '<option' + (b === selected ? " selected" : "") + '>' + b + '</option>';
  }).join("");
}

function batchText(b) { return b || "Not specified"; }

async function api(action, data) {
  data = data || {};
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 40000);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(Object.assign({ action: action }, data)),
      signal: ctrl.signal
    });
    return res.json();
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("The request timed out. Please try again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function adminApi(action, data) {
  const out = await api(action, Object.assign({ token: state.token }, data || {}));
  if (out && out.auth === false) { logout(); throw new Error("Session expired"); }
  return out;
}

function toast(msg, isErr) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (isErr ? " err" : "");
  t.hidden = false;
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.hidden = true; }, 3000);
}

function confirmModal(title, bodyHtml, okLabel, okClass, onOk, loadingLabel) {
  $("#modal-title").textContent = title;
  $("#modal-text").innerHTML = bodyHtml;
  const errEl = $("#modal-error");
  if (errEl) { errEl.textContent = ""; errEl.hidden = true; }
  const actions = $("#modal-actions");
  actions.innerHTML = "";
  const cancel = document.createElement("button");
  cancel.className = "btn-outline";
  cancel.textContent = "Cancel";
  cancel.onclick = closeModal;
  const ok = document.createElement("button");
  ok.className = okClass || "btn-primary";
  ok.textContent = okLabel || "Confirm";
  ok.onclick = function () { runConfirm(); };
  actions.appendChild(cancel);
  actions.appendChild(ok);
  $("#modal-backdrop").hidden = false;
  $("#modal").hidden = false;

  function runConfirm() {
    if (ok.disabled) return;
    const result = onOk();
    if (result && typeof result.then === "function") {
      ok.disabled = true;
      cancel.disabled = true;
      ok.innerHTML = '<span class="btn-spinner"></span>' + (loadingLabel || "Working…");
      $("#modal").setAttribute("aria-busy", "true");
      result.then(function () {
        closeModal();
      }).catch(function (e) {
        ok.disabled = false;
        cancel.disabled = false;
        ok.innerHTML = "";
        ok.textContent = okLabel || "Confirm";
        $("#modal").setAttribute("aria-busy", "false");
        if (errEl) {
          errEl.textContent = (e && e.message) ? e.message : "Something went wrong. Please try again.";
          errEl.hidden = false;
        }
      });
    } else {
      closeModal();
    }
  }
}
function closeModal() { $("#modal-backdrop").hidden = true; $("#modal").hidden = true; }

function statusBadge(status) {
  const map = {
    "Paid": "b-Paid", "Confirmed": "b-Confirmed", "Manually Paid": "b-Manually",
    "Under Review": "b-Under", "Payment Pending": "b-Pending",
    "Payment Rejected": "b-Rejected", "Cancelled": "b-Cancelled", "New": "b-New"
  };
  return '<span class="badge ' + (map[status] || "b-New") + '">' + esc(status) + "</span>";
}

/* ------------------------------- auth ----------------------------------- */

function saveToken(t, remember) {
  state.token = t;
  try { (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t); } catch (e) {}
}
function loadToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
  } catch (e) { return null; }
}
function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
}

async function tryResume() {
  const t = loadToken();
  if (!t) return;
  state.token = t;
  try {
    const d = await adminApi("dashboard");
    if (d && d.ok) { state.admin = { name: "Administrator", role: "Super Admin" }; enterApp(); }
  } catch (e) { clearToken(); }
}

async function login(username, password, remember) {
  try {
    const res = await api("login", { username: username, password: password });
    if (!res.ok) {
      $("#login-error").textContent = res.error || "Unable to sign in. Please check your credentials and try again.";
      hideAuthLoading();
      authBusy = false;
      return;
    }
    state.admin = res.admin;
    saveToken(res.token, remember);
    $("#login-error").textContent = "";
    showAuthSuccess();
    setTimeout(function () {
      hideAuthLoading();
      authBusy = false;
      enterApp();
    }, 450);
  } catch (err) {
    $("#login-error").textContent = "Unable to sign in. Please check your credentials and try again.";
    hideAuthLoading();
    authBusy = false;
  }
}

function setAuthInputsLocked(locked) {
  ["#login-user", "#login-pass", "#login-btn", "#pass-toggle", "#login-remember"].forEach(function (s) {
    const el = $(s);
    if (el) el.disabled = locked;
  });
}

function showAuthLoading() {
  const a = $("#auth-loading");
  $("#auth-status").textContent = "Signing you in…";
  $("#auth-sub").textContent = "Securely connecting to the admin dashboard";
  a.classList.remove("success");
  a.setAttribute("aria-busy", "true");
  a.hidden = false;
  setAuthInputsLocked(true);
}

function hideAuthLoading() {
  const a = $("#auth-loading");
  a.hidden = true;
  a.setAttribute("aria-busy", "false");
  a.classList.remove("success");
  setAuthInputsLocked(false);
}

function showAuthSuccess() {
  const a = $("#auth-loading");
  $("#auth-status").textContent = "✓ Access granted";
  $("#auth-sub").textContent = "Loading your dashboard…";
  a.classList.add("success");
}

function logout() {
  if (state.token) api("logout", { token: state.token }).catch(function () {});
  clearToken();
  state.token = null; state.admin = null;
  $("#app").hidden = true;
  $("#login-wrap").hidden = false;
  $("#login-pass").value = "";
}

function enterApp() {
  $("#login-wrap").hidden = true;
  $("#app").hidden = false;
  $("#side-name").textContent = state.admin ? state.admin.name : "Administrator";
  $("#side-role").textContent = state.admin && state.admin.role ? state.admin.role : "Super Admin";
  $("#side-avatar").textContent = (state.admin && state.admin.name ? state.admin.name : "A").charAt(0).toUpperCase();
  $("#top-avatar").textContent = $("#side-avatar").textContent;
  showView("dashboard");
}

/* ------------------------------ routing --------------------------------- */

function showView(name, force) {
  const seq = ++navSeq;
  currentView = name;
  $("#section-error").hidden = true;
  $$(".view").forEach(function (v) { v.hidden = v.getAttribute("data-view") !== name; });
  $$(".side-link").forEach(function (l) { l.classList.toggle("active", l.getAttribute("data-view") === name); });
  $("#sidebar").classList.remove("open");
  closeDrawer();
  const loaders = {
    dashboard: loadDashboard, preorders: loadOrders, payments: loadPayments,
    slips: loadSlips, manual: loadManual, reports: null, production: loadProduction, settings: loadSettings
  };
  if (loaders[name]) loaders[name](seq, !!force);
}

/* ------------------------------ drawer ---------------------------------- */

function openDrawer() {
  $("#drawer").hidden = false;
  $("#drawer-backdrop").hidden = false;
  requestAnimationFrame(function () { $("#drawer").classList.add("open"); });
}
function closeDrawer() {
  $("#drawer").classList.remove("open");
  setTimeout(function () { $("#drawer").hidden = true; $("#drawer-backdrop").hidden = true; }, 250);
}

let drawerRetry = null;

function drawerSkeleton(title, sub) {
  return '<div class="dd-loading">' +
    '<span class="spinner" aria-hidden="true"></span>' +
    '<div><p class="dd-loading-title">' + (title || "Loading…") + "</p>" +
    '<p class="dd-loading-sub">' + (sub || "Fetching the latest data…") + "</p></div></div>" +
    '<div class="dd-block"><div class="k">&nbsp;</div>' +
    skLine("92%") + skLine("76%") + skLine("84%") + skLine("58%") + skLine("70%") + "</div>" +
    '<div class="dd-block"><div class="k">&nbsp;</div>' + sk("100%", "96px") + "</div>";
}

function drawerError(msg) {
  return '<div class="error-state"><div class="big">' + (msg || "Unable to load") + "</div>" +
    "<p>We couldn't retrieve the latest information. Please try again.</p>" +
    '<button class="btn-outline" data-drawer-retry>Try again</button></div>';
}

function receiptLoadingSkeleton() {
  return '<div class="sk" style="height:280px;border-radius:10px"></div>' +
    '<p class="dd-loading-sub" style="margin-top:12px"><span class="spinner" aria-hidden="true"></span> Loading receipt…</p>';
}

/* ----------------------------- dashboard -------------------------------- */

function chartSkeleton(h) { return '<div class="sk" style="height:' + (h || 160) + "px;width:100%\"></div>"; }
function tableSkeleton(cols, rows) {
  let head = "<tr>";
  for (let i = 0; i < cols; i++) head += "<th>" + skLine("70%") + "</th>";
  head += "</tr>";
  return head + skRows(rows, cols);
}

function renderDashboardSkeleton() {
  $("#stat-grid").innerHTML = statSkeleton(6);
  $("#status-chart").innerHTML = chartSkeleton(150);
  $("#time-chart").innerHTML = chartSkeleton(180);
  $("#design-chart").innerHTML = chartSkeleton(110);
  $("#size-chart").innerHTML = chartSkeleton(110);
  $("#batch-chart").innerHTML = chartSkeleton(90);
  $("#recent-table").innerHTML = tableSkeleton(8, 6);
}

function renderDashboard(d) {
  renderStats(d.stats);
  renderStatusChart(d.statusCounts);
  renderTimeChart(d.ordersOverTime);
  renderDesignChart(d.designStats);
  renderSizeChart(d.sizeStats);
  renderBatchChart(d.batchStats);
  renderRecent(d.recentOrders);
  $("#slips-badge").hidden = !d.stats.slipPending;
  $("#slips-badge").textContent = d.stats.slipPending;
  loadNotifications();
}

async function loadDashboard(seq, force) {
  if (!force && state.cache.dashboard) { renderDashboard(state.cache.dashboard); return; }
  renderDashboardSkeleton();
  setContentBusy(true);
  try {
    const d = await adminApi("dashboard");
    if (seq !== navSeq) return;
    if (!d.ok) { showSectionError(); return; }
    state.cache.dashboard = d;
    renderDashboard(d);
  } catch (e) {
    if (seq === navSeq) showSectionError();
  } finally {
    if (seq === navSeq) setContentBusy(false);
  }
}

function refreshDashboard() {
  const btn = $("#refresh-btn");
  if (btn.disabled) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>Refreshing…';
  const seq = ++navSeq;
  loadDashboard(seq, true).finally(function () {
    btn.disabled = false;
    btn.textContent = "Refresh";
  });
}

function renderStats(s) {
  const cards = [
    { label: "Total Preorders", value: s.totalOrders, sub: "all orders" },
    { label: "Total Shirts", value: s.totalShirts, sub: "shirts ordered" },
    { label: "Paid", value: money(s.paidAmount), sub: "received" },
    { label: "Pending Payment", value: money(s.pendingAmount), sub: "outstanding", neg: true },
    { label: "Bank Slips", value: s.slipPending, sub: "pending review" },
    { label: "Manual Orders", value: s.manualOrders, sub: "entered by hand" }
  ];
  $("#stat-grid").innerHTML = cards.map(function (c) {
    return '<div class="stat-card"><div class="stat-label">' + esc(c.label) + '</div>' +
      '<div class="stat-value">' + c.value + '</div>' +
      '<div class="stat-sub' + (c.neg ? " neg" : "") + '">' + esc(c.sub) + "</div></div>";
  }).join("");
}

function renderStatusChart(counts) {
  const order = ["New", "Payment Pending", "Under Review", "Paid", "Manually Paid", "Payment Rejected", "Confirmed", "Cancelled"];
  const items = order.filter(function (k) { return counts[k]; }).map(function (k) { return { label: k, value: counts[k] }; });
  $("#status-chart").innerHTML = barRows(items);
}

function barRows(items) {
  if (!items.length) return '<div class="empty">No data yet.</div>';
  const max = Math.max.apply(null, items.map(function (i) { return i.value; })) || 1;
  return items.map(function (i) {
    const pct = Math.round(i.value / max * 100);
    return '<div class="bar-row"><span class="lbl">' + esc(i.label) + '</span>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="val">' + i.value + "</span></div>";
  }).join("");
}

function renderTimeChart(days) {
  const max = Math.max.apply(null, days.map(function (d) { return d.count; })) || 1;
  const W = 560, H = 160, pad = 20;
  const bw = (W - pad * 2) / days.length;
  const bars = days.map(function (d, i) {
    const h = d.count ? Math.max(4, d.count / max * (H - pad - 20)) : 2;
    const x = pad + i * bw + bw * 0.15;
    const y = H - pad - h;
    return '<rect x="' + x + '" y="' + y + '" width="' + (bw * 0.7) + '" height="' + h + '" rx="3" fill="#211A70" opacity="0.85"/>';
  }).join("");
  $("#time-chart").innerHTML =
    '<svg class="chart-svg" viewBox="0 0 ' + W + " " + H + '">' + bars + "</svg>" +
    '<div style="display:flex;justify-content:space-between;font-size:10px;color:#8790A9;margin-top:4px">' +
    days.map(function (d) { return "<span>" + esc(d.date.slice(0, 6)) + "</span>"; }).join("") + "</div>";
}

function renderDesignChart(list) {
  $("#design-chart").innerHTML = barRows(list.map(function (d) { return { label: d.design, value: d.shirts }; }));
}
function renderSizeChart(sizes) {
  $("#size-chart").innerHTML = barRows(SHIRT_SIZES.map(function (s) { return { label: s, value: sizes[s] || 0 }; }));
}
function renderBatchChart(batches) {
  $("#batch-chart").innerHTML = barRows(BATCH_OPTIONS.map(function (b) { return { label: b, value: (batches && batches[b]) || 0 }; }));
}

function renderRecent(orders) {
  const head = '<tr><th>Order</th><th>Customer</th><th>Class</th><th>Design</th><th>Size</th><th>Qty</th><th>Total</th><th>Status</th></tr>';
  const rows = orders.map(function (o) {
    return '<tr class="clickable" data-order="' + esc(o.OrderID) + '">' +
      '<td class="c-id">' + esc(o.OrderID) + "</td>" +
      '<td class="c-name">' + esc(o.Name) + "</td>" +
      '<td class="c-muted">' + esc(o.GradeClass) + "</td>" +
      "<td>" + esc(o.Design) + "</td><td>" + esc(o.Size) + "</td><td>" + esc(o.Qty) + "</td>" +
      "<td>" + money(o.Total) + "</td><td>" + statusBadge(o.Status) + "</td></tr>";
  }).join("");
  $("#recent-table").innerHTML = head + (rows || '<tr><td colspan="8" class="empty">No orders yet.</td></tr>');
}

/* ------------------------------ preorders -------------------------------- */

function renderOrdersSkeleton() {
  $("#orders-table").innerHTML = tableSkeleton(12, 8);
  $("#orders-empty").hidden = true;
}

async function loadOrders(seq, force) {
  if (!force && state.cache.orders) { renderOrders(state.cache.orders); return; }
  renderOrdersSkeleton();
  setContentBusy(true);
  try {
    const d = await adminApi("listOrders");
    if (seq !== navSeq) return;
    if (!d.ok) { showSectionError(); return; }
    state.cache.orders = d.orders;
    renderOrders(d.orders);
  } catch (e) {
    if (seq === navSeq) showSectionError();
  } finally {
    if (seq === navSeq) setContentBusy(false);
  }
}

function orderMatches(o, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return [o.OrderID, o.Name, o.GradeClass, o.Contact, o.Design, o.Size, o.Batch].some(function (f) {
    return String(f || "").toLowerCase().indexOf(q) >= 0;
  });
}

function renderOrders(orders) {
  const q = $("#order-search").value.toLowerCase();
  const status = $("#order-filter-status").value;
  const design = $("#order-filter-design").value;
  const source = $("#order-filter-source").value;
  const filtered = orders.filter(function (o) {
    return orderMatches(o, q) &&
      (!status || o.Status === status) &&
      (!design || o.Design === design) &&
      (!source || o.Source === source);
  });

  const head = '<tr><th>Order</th><th>Customer</th><th>Class</th><th>Batch</th><th>Design</th><th>Size</th><th>Qty</th><th>Total</th><th>Payment</th><th>Source</th><th>Date</th><th>Status</th><th></th></tr>';
  const rows = filtered.map(function (o) {
    return '<tr>' +
      '<td class="c-id">' + esc(o.OrderID) + "</td>" +
      '<td class="c-name">' + esc(o.Name) + "</td>" +
      '<td class="c-muted">' + esc(o.GradeClass) + "</td>" +
      '<td class="c-batch">' + esc(batchText(o.Batch)) + "</td>" +
      "<td>" + esc(o.Design) + "</td><td>" + esc(o.Size) + "</td><td>" + esc(o.Qty) + "</td>" +
      "<td>" + money(o.Total) + "</td>" +
      "<td>" + statusBadge(o.Status) + "</td>" +
      "<td>" + esc(o.Source) + "</td>" +
      '<td class="c-muted">' + fmtDate(o.CreatedAt) + "</td>" +
      "<td>" + statusBadge(o.Status) + "</td>" +
      '<td><div class="row-actions"><button class="act-btn" data-view="' + esc(o.OrderID) + '">View</button></div></td></tr>';
  }).join("");

  $("#orders-table").innerHTML = head + (rows || "");
  $("#orders-empty").hidden = filtered.length > 0;
}

/* ------------------------------ payments -------------------------------- */

function renderPaymentsSkeleton() {
  $("#payment-stats").innerHTML = statSkeleton(4);
  $("#payments-table").innerHTML = tableSkeleton(7, 8);
  $("#payments-empty").hidden = true;
}

function renderPayments(orders) {
  const paidStatuses = ["Paid", "Manually Paid", "Confirmed"];
  const paid = orders.filter(function (o) { return paidStatuses.indexOf(o.Status) >= 0; });
  const pending = orders.filter(function (o) { return paidStatuses.indexOf(o.Status) < 0 && o.Status !== "Cancelled"; });
  const received = paid.reduce(function (s, o) { return s + (Number(o.Total) || 0); }, 0);
  const outstanding = pending.reduce(function (s, o) { return s + (Number(o.Total) || 0); }, 0);

  $("#payment-stats").innerHTML =
    statCard("Total expected", money(received + outstanding)) +
    statCard("Total received", money(received)) +
    statCard("Total pending", money(outstanding), true) +
    statCard("Orders paid", paid.length);

  const head = '<tr><th>Order</th><th>Customer</th><th>Batch</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th><th>Verified By</th></tr>';
  const rows = orders.map(function (o) {
    return '<tr>' +
      '<td class="c-id">' + esc(o.OrderID) + "</td>" +
      '<td class="c-name">' + esc(o.Name) + "</td>" +
      '<td class="c-batch">' + esc(batchText(o.Batch)) + "</td>" +
      "<td>" + money(o.Total) + "</td>" +
      "<td>" + (o.Source === "Manual" ? "Cash/Manual" : "Bank Transfer") + "</td>" +
      "<td>" + statusBadge(o.Status) + "</td>" +
      '<td class="c-muted">' + fmtDate(o.CreatedAt) + "</td>" +
      '<td class="c-muted">—</td></tr>';
  }).join("");
  $("#payments-table").innerHTML = head + (rows || "");
  $("#payments-empty").hidden = orders.length > 0;
}

async function loadPayments(seq, force) {
  if (!force && state.cache.orders) { renderPayments(state.cache.orders); return; }
  renderPaymentsSkeleton();
  setContentBusy(true);
  try {
    const d = await adminApi("listOrders");
    if (seq !== navSeq) return;
    if (!d.ok) { showSectionError(); return; }
    state.cache.orders = d.orders;
    renderPayments(d.orders);
  } catch (e) {
    if (seq === navSeq) showSectionError();
  } finally {
    if (seq === navSeq) setContentBusy(false);
  }
}

function statCard(label, value, neg) {
  return '<div class="stat-card"><div class="stat-label">' + label + '</div>' +
    '<div class="stat-value">' + value + '</div></div>';
}

/* ------------------------------ bank slips ------------------------------ */

function renderSlipsSkeleton() {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += '<div class="slip-card"><div class="sk" style="height:200px;border-radius:0"></div>' +
      '<div class="slip-body">' + skLine("55%") + skLine("85%") + skLine("45%") + "</div></div>";
  }
  $("#slip-grid").innerHTML = out;
  $("#slips-empty").hidden = true;
}

function receiptPreviewInner(s) {
  const type = String(s.FileType || "").toLowerCase();
  if (type === "application/pdf") {
    return '<div class="receipt-placeholder">' +
      '<span class="pdf-icon">PDF</span>' +
      '<span class="pdf-label">PDF Document</span>' +
      '<span class="pdf-name">' + esc(s.FileName || "bank_slip.pdf") + "</span>" +
      '<button type="button" class="open-pdf" data-open-slip="' + esc(s.SlipID) + '">Open PDF</button></div>';
  }
  if (type.indexOf("image/") === 0) {
    return '<div class="sk" style="width:100%;height:100%"></div>';
  }
  return '<div class="receipt-placeholder"><span class="pdf-label">Unsupported file</span>' +
    '<button type="button" class="open-pdf" data-open-slip="' + esc(s.SlipID) + '">Open file</button></div>';
}

function brokenPreview(slipId) {
  return '<div class="receipt-placeholder"><span class="pdf-label">Unable to preview receipt</span>' +
    '<button type="button" class="open-pdf" data-open-slip="' + esc(slipId) + '">Open original file</button></div>';
}

function renderSlips(slips, orders) {
  $("#slips-empty").hidden = slips.length > 0;
  const pending = slips.filter(function (s) { return s.Status === "Pending Review"; }).length;
  const countEl = $("#slips-count");
  countEl.textContent = pending + " Pending Review";
  countEl.hidden = pending === 0;

  $("#slip-grid").innerHTML = slips.map(function (s) {
    const o = orders.find(function (x) { return x.OrderID === s.OrderID; }) || {};
    return '<div class="slip-card">' +
      '<div class="slip-preview" data-slip="' + esc(s.SlipID) + '" data-type="' + esc(s.FileType || "") + '">' +
      receiptPreviewInner(s) + "</div>" +
      '<div class="slip-body">' +
      '<h4>' + esc(o.Name || "Unknown") + "</h4>" +
      '<div class="slip-meta">' + esc(s.OrderID) + " · " + esc(s.FileName) + "<br>" +
      fmtDate(s.UploadedAt) + " " + fmtTime(s.UploadedAt) + " · " + statusBadge(s.Status) + "</div>" +
      '<div class="slip-actions">' +
      '<button class="btn-primary" data-slip="' + esc(s.SlipID) + '">Review</button>' +
      '<button class="btn-outline" data-goto-order="' + esc(s.OrderID) + '">View Order</button>' +
      "</div></div></div>";
  }).join("");
  loadPreviewImages(slips);
}

async function loadSlips(seq, force) {
  if (!force && state.cache.slips) { renderSlips(state.cache.slips, state.cache.orders || []); return; }
  renderSlipsSkeleton();
  setContentBusy(true);
  try {
    const d = await adminApi("listBankSlips");
    if (seq !== navSeq) return;
    if (!d.ok) { showSectionError(); return; }
    let orders = state.cache.orders;
    if (!orders) {
      const od = await adminApi("listOrders");
      if (seq !== navSeq) return;
      orders = (od && od.orders) || [];
      state.cache.orders = orders;
    }
    state.cache.slips = d.slips;
    renderSlips(d.slips, orders);
  } catch (e) {
    if (seq === navSeq) showSectionError();
  } finally {
    if (seq === navSeq) setContentBusy(false);
  }
}

function loadPreviewImages(slips) {
  slips.forEach(function (s) {
    if (String(s.FileType || "").toLowerCase().indexOf("image/") !== 0) return;
    const el = $('.slip-preview[data-slip="' + s.SlipID + '"]');
    if (!el) return;
    adminApi("getBankSlip", { slipId: s.SlipID }).then(function (r) {
      if (!el.isConnected) return;
      if (r.ok) {
        const img = document.createElement("img");
        img.alt = "Receipt preview";
        img.src = "data:" + r.mime + ";base64," + r.data;
        img.onerror = function () { el.innerHTML = brokenPreview(s.SlipID); };
        el.innerHTML = "";
        el.appendChild(img);
      } else {
        el.innerHTML = brokenPreview(s.SlipID);
      }
    }).catch(function () {
      if (el.isConnected) el.innerHTML = brokenPreview(s.SlipID);
    });
  });
}

function openReceiptFile(slipId) {
  adminApi("getBankSlip", { slipId: slipId }).then(function (r) {
    if (!r.ok) { toast("Receipt unavailable", true); return; }
    const raw = atob(r.data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const blob = new Blob([bytes], { type: r.mime });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }).catch(function () { toast("Receipt unavailable", true); });
}

function openLightbox(slipId) {
  const lb = $("#lightbox");
  const img = $("#lightbox-img");
  img.removeAttribute("src");
  lb.hidden = false;
  document.body.style.overflow = "hidden";
  adminApi("getBankSlip", { slipId: slipId }).then(function (r) {
    if (r.ok) img.src = "data:" + r.mime + ";base64," + r.data;
    else { closeLightbox(); toast("Receipt unavailable", true); }
  }).catch(function () { closeLightbox(); toast("Receipt unavailable", true); });
}
function closeLightbox() {
  $("#lightbox").hidden = true;
  $("#lightbox-img").removeAttribute("src");
  document.body.style.overflow = "";
}

function onPreviewClick(preview) {
  const slipId = preview.getAttribute("data-slip");
  const type = String(preview.getAttribute("data-type") || "").toLowerCase();
  if (type.indexOf("image/") === 0) { openLightbox(slipId); }
  else { openReceiptFile(slipId); }
}

function openSlipReview(slipId) {
  drawerRetry = function () { openSlipReview(slipId); };
  $("#drawer-title").textContent = "Loading review…";
  $("#drawer-body").innerHTML = drawerSkeleton("Loading review…", "Loading order information…");
  openDrawer();

  const loadSlips = state.cache.slips
    ? Promise.resolve(state.cache.slips)
    : adminApi("listBankSlips").then(function (d) { state.cache.slips = d.slips || []; return state.cache.slips; });
  const loadOrders = state.cache.orders
    ? Promise.resolve(state.cache.orders)
    : adminApi("listOrders").then(function (d) { state.cache.orders = d.orders || []; return state.cache.orders; });

  Promise.all([loadSlips, loadOrders]).then(function (res) {
    const slip = res[0].find(function (s) { return s.SlipID === slipId; });
    if (!slip) { $("#drawer-body").innerHTML = drawerError("Receipt not found."); return; }
    const order = res[1].find(function (x) { return x.OrderID === slip.OrderID; }) || {};
    $("#drawer-title").textContent = "Bank Slip — " + slip.OrderID;
    renderSlipReview(slip, order);
  }).catch(function (e) {
    console.error("openSlipReview failed:", e);
    $("#drawer-body").innerHTML = drawerError("Unable to load receipt.");
  });
}

function renderSlipReview(slip, order) {
  const body = $("#drawer-body");
  body.innerHTML =
    '<div class="dd-block"><div class="k">Bank slip</div><div id="slip-large-wrap">' + receiptLoadingSkeleton() + '</div></div>' +
    '<div class="dd-block dd-row"><div><div class="k">Customer</div><div class="v">' + esc(order.Name || "—") + '</div></div>' +
    '<div><div class="k">Order</div><div class="v">' + esc(slip.OrderID) + '</div></div></div>' +
    '<div class="dd-block dd-row"><div><div class="k">Batch</div><div class="v c-batch">' + esc(batchText(order.Batch)) + '</div></div>' +
    '<div><div class="k">Edition</div><div class="v">' + esc(order.Design || "—") + '</div></div></div>' +
    '<div class="dd-block dd-row"><div><div class="k">Size</div><div class="v">' + esc(order.Size || "—") + '</div></div>' +
    '<div><div class="k">Amount</div><div class="v">' + money(order.Total) + '</div></div></div>' +
    '<div class="dd-block"><div class="k">Status</div><div class="v">' + statusBadge(slip.Status) + "</div></div>" +
    '<div class="dd-block" style="display:flex;gap:10px;flex-wrap:wrap">' +
    (slip.Status === "Pending Review" ? '<button class="btn-primary" id="slip-approve">Approve Payment</button><button class="btn-danger" id="slip-reject">Reject</button>' : "") +
    '<button class="btn-outline" id="slip-request">Request New Slip</button>' +
    '<button class="btn-outline" id="slip-download">Download</button></div>';

  adminApi("getBankSlip", { slipId: slip.SlipID }).then(function (r) {
    const wrap = $("#slip-large-wrap");
    if (r.ok) {
      if (r.mime === "application/pdf") {
        wrap.innerHTML = '<iframe class="slip-large iframe" src="data:application/pdf;base64,' + r.data + '"></iframe>';
      } else {
        wrap.innerHTML = '<img class="slip-large" src="data:' + r.mime + ";base64," + r.data + '" alt="receipt" />';
      }
      $("#slip-download").onclick = function () {
        const a = document.createElement("a");
        a.href = "data:" + r.mime + ";base64," + r.data;
        a.download = slip.FileName || "bank_slip";
        a.click();
      };
    } else {
      wrap.innerHTML = '<div class="receipt-placeholder"><span class="pdf-label">Unable to preview receipt</span>' +
        '<button type="button" class="open-pdf" data-open-slip="' + esc(slip.SlipID) + '">Open original file</button></div>';
    }
  }).catch(function () {
    const wrap = $("#slip-large-wrap");
    if (wrap) wrap.innerHTML = '<div class="receipt-placeholder"><span class="pdf-label">Unable to load receipt</span></div>';
  });

  const approve = $("#slip-approve"); if (approve) approve.onclick = function () {
    confirmModal("Approve Payment", "Are you sure you want to mark this payment as verified?", "Confirm Payment", "btn-primary", function () {
      adminApi("approvePayment", { orderId: slip.OrderID }).then(function (r) {
        toast(r.ok ? "Payment approved" : (r.error || "Error"), !r.ok); closeDrawer(); loadSlips(navSeq, true);
      });
    });
  };
  const reject = $("#slip-reject"); if (reject) reject.onclick = function () {
    const reason = prompt("Rejection reason (e.g. unclear, wrong amount, wrong account):");
    if (reason != null) adminApi("rejectPayment", { orderId: slip.OrderID, reason: reason }).then(function (r) {
      toast(r.ok ? "Payment rejected" : (r.error || "Error"), !r.ok); closeDrawer(); loadSlips(navSeq, true);
    });
  };
  $("#slip-request").onclick = function () {
    adminApi("requestNewSlip", { orderId: slip.OrderID }).then(function (r) {
      toast(r.ok ? "New slip requested" : (r.error || "Error"), !r.ok); closeDrawer(); loadSlips(navSeq, true);
    });
  };
}

/* ----------------------------- order detail ----------------------------- */

function openOrder(orderId) {
  drawerRetry = function () { openOrder(orderId); };
  $("#drawer-title").textContent = "Opening order…";
  $("#drawer-body").innerHTML = drawerSkeleton("Opening order…", "Loading order details…");
  openDrawer();

  const load = state.cache.orders
    ? Promise.resolve(state.cache.orders)
    : adminApi("listOrders").then(function (d) { state.cache.orders = d.orders || []; return state.cache.orders; });

  load.then(function (orders) {
    const o = orders.find(function (x) { return x.OrderID === orderId; });
    if (!o) { $("#drawer-body").innerHTML = drawerError("Order not found."); return; }
    $("#drawer-title").textContent = o.OrderID;
    renderOrderDetail(o, orderId);
  }).catch(function (e) {
    console.error("openOrder failed:", e);
    $("#drawer-body").innerHTML = drawerError("Unable to open order.");
  });
}

function renderOrderDetail(o, orderId) {
  const body = $("#drawer-body");
  body.innerHTML =
    '<div class="dd-block dd-row">' +
    '<div><div class="k">Customer</div><div class="v">' + esc(o.Name) + "</div></div>" +
    '<div><div class="k">Order ID</div><div class="v c-id">' + esc(o.OrderID) + "</div></div></div>" +
    '<div class="dd-block dd-row">' +
    '<div><div class="k">Grade &amp; class</div><div class="v">' + esc(o.GradeClass) + "</div></div>" +
    '<div><div class="k">Batch</div><div class="v c-batch">' + esc(batchText(o.Batch)) + "</div></div></div>" +
    '<div class="dd-block dd-row">' +
    '<div><div class="k">Contact</div><div class="v">' + esc(o.Contact) + "</div></div>" +
    '<div><div class="k">Design</div><div class="v">' + esc(o.Design) + "</div></div></div>" +
    '<div class="dd-block dd-row">' +
    '<div><div class="k">Size</div><div class="v">' + esc(o.Size) + "</div></div>" +
    '<div><div class="k">Quantity</div><div class="v">' + esc(o.Qty) + " × " + money(o.Price) + "</div></div></div>" +
    '<div class="dd-block dd-row">' +
    '<div><div class="k">Total</div><div class="v"><strong>' + money(o.Total) + "</strong></div></div>" +
    '<div><div class="k">Source</div><div class="v">' + esc(o.Source) + "</div></div></div>" +
    '<div class="dd-block dd-row">' +
    '<div><div class="k">Date</div><div class="v">' + fmtDate(o.CreatedAt) + " " + fmtTime(o.CreatedAt) + "</div></div>" +
    '<div><div class="k">Status</div><div class="v">' + statusBadge(o.Status) + "</div></div></div>" +
    '<div class="dd-block"><div class="k">Customer note</div><div class="dd-note">' + esc(o.Note || "—") + "</div></div>" +
    '<div class="dd-block" style="display:flex;gap:10px;flex-wrap:wrap">' +
    '<button class="btn-primary" id="od-edit">Edit</button>' +
    '<button class="btn-outline" id="od-note">Add Note</button>' +
    '<button class="btn-danger" id="od-delete">Delete</button>' +
    '<select class="f-select" id="od-status">' +
    ["New", "Payment Pending", "Under Review", "Paid", "Manually Paid", "Payment Rejected", "Confirmed", "Cancelled"]
      .map(function (s) { return '<option' + (s === o.Status ? " selected" : "") + ">" + s + "</option>"; }).join("") +
    "</select><button class='btn-outline' id='od-status-save'>Save Status</button></div>";

  $("#od-status-save").onclick = function () {
    adminApi("setStatus", { orderId: orderId, status: $("#od-status").value }).then(function (r) {
      toast(r.ok ? "Status updated" : (r.error || "Error"), !r.ok); closeDrawer(); loadOrders(navSeq, true);
    });
  };
  $("#od-note").onclick = function () {
    const n = prompt("Internal note:");
    if (n) adminApi("addNote", { orderId: orderId, note: n }).then(function (r) {
      toast(r.ok ? "Note saved" : (r.error || "Error"), !r.ok); closeDrawer(); openOrder(orderId);
    });
  };
  $("#od-delete").onclick = function () {
    const details =
      '<p>You are about to permanently delete order <strong>' + esc(o.OrderID) + "</strong>.</p>" +
      '<div class="confirm-grid">' +
      "<span>Customer</span><strong>" + esc(o.Name) + "</strong>" +
      "<span>Design</span><strong>" + esc(o.Design) + "</strong>" +
      "<span>Size</span><strong>" + esc(o.Size) + "</strong>" +
      "<span>Quantity</span><strong>" + esc(o.Qty) + "</strong>" +
      "<span>Total</span><strong>" + money(o.Total) + "</strong>" +
      '</div><p class="confirm-warn">This action cannot be undone.</p>';
    confirmModal("Delete this order?", details, "Delete Order", "btn-danger-fill", function () {
      return adminApi("deleteOrder", { orderId: orderId }).then(function (r) {
        if (!r.ok) throw new Error(r.error || "The order could not be deleted. Please try again.");
        state.cache.dashboard = null;
        state.cache.slips = null;
        toast("✓ Order deleted — " + orderId + " has been removed.");
        closeDrawer();
        loadOrders(navSeq, true);
      });
    }, "Deleting…");
  };
  $("#od-edit").onclick = function () { renderEditForm(o); };
}

function renderEditForm(o) {
  const body = $("#drawer-body");
  body.innerHTML =
    '<div class="dd-block"><div class="k">Edit order</div></div>' +
    '<label class="f-label">Full name</label><input class="f-input" id="e-name" value="' + esc(o.Name) + '">' +
    '<label class="f-label">Grade &amp; class</label><input class="f-input" id="e-grade" value="' + esc(o.GradeClass) + '">' +
    '<label class="f-label">Contact</label><input class="f-input" id="e-contact" value="' + esc(o.Contact) + '">' +
    '<div class="f-row"><div><label class="f-label">Batch</label><select class="f-input" id="e-batch">' +
    batchOptions(o.Batch) +
    '</select></div><div><label class="f-label">Design</label><select class="f-input" id="e-design">' +
    ['Design 01', 'Design 02'].map(function (d) { return '<option' + (d === o.Design ? " selected" : "") + '>' + d + '</option>'; }).join("") +
    '</select></div></div>' +
    '<label class="f-label">Size</label><select class="f-input" id="e-size">' +
    sizeOptions(o.Size) +
    '</select>' +
    '<label class="f-label">Quantity</label><input class="f-input" id="e-qty" type="number" min="1" value="' + esc(o.Qty) + '">' +
    '<button class="btn-primary" id="e-save" style="margin-top:14px">Save changes</button>' +
    '<button class="btn-outline" id="e-cancel" style="margin-top:14px">Cancel</button>';
  $("#e-save").onclick = function () {
    const btn = $("#e-save");
    btnBusy(btn, true, "Saving…");
    adminApi("editOrder", {
      orderId: o.OrderID, name: $("#e-name").value, gradeClass: $("#e-grade").value,
      contact: $("#e-contact").value, batch: $("#e-batch").value, design: $("#e-design").value, size: $("#e-size").value, quantity: $("#e-qty").value
    }).then(function (r) {
      btnBusy(btn, false);
      toast(r.ok ? "Order updated" : (r.error || "Error"), !r.ok); closeDrawer(); loadOrders(navSeq, true);
    });
  };
  $("#e-cancel").onclick = function () { closeDrawer(); openOrder(o.OrderID); };
}

/* ------------------------------ manual ---------------------------------- */

function loadManual() {
  $("#m-size").innerHTML = sizeOptions("M");
  $("#q-size").innerHTML = sizeOptions("M");
  $("#m-batch").innerHTML = batchOptions("2027 Batch");
  $("#q-batch").innerHTML = batchOptions("2027 Batch");
  const calc = function () {
    const price = DESIGN_PRICES[$("#m-design").value] || 0;
    $("#m-total").textContent = money(price * (parseInt($("#m-qty").value, 10) || 1));
  };
  $("#m-qty").oninput = calc;
  $("#m-design").onchange = calc;
  calc();
  $("#quick-submit").onclick = quickSubmit;
  $("#manual-form").onsubmit = function (e) {
    e.preventDefault();
    const btn = $("#manual-form button[type=submit]");
    if (btn && btn.disabled) return;
    btnBusy(btn, true, "Adding…");
    adminApi("addManualOrder", {
      name: $("#m-name").value, grade: $("#m-grade").value, class: $("#m-class").value,
      contact: $("#m-contact").value, batch: $("#m-batch").value, design: $("#m-design").value, size: $("#m-size").value,
      quantity: $("#m-qty").value, method: $("#m-method").value, paidStatus: $("#m-status").value,
      reference: $("#m-ref").value, note: $("#m-note").value
    }).then(function (r) {
      btnBusy(btn, false);
      toast(r.ok ? "Manual order added (" + r.orderId + ")" : (r.error || "Error"), !r.ok);
      if (r.ok) $("#manual-form").reset();
    });
  };
}

function quickSubmit() {
  const btn = $("#quick-submit");
  if (btn.disabled) return;
  btnBusy(btn, true, "Adding…");
  adminApi("addManualOrder", {
    name: $("#q-name").value, class: $("#q-class").value, batch: $("#q-batch").value, design: $("#q-design").value,
    size: $("#q-size").value, quantity: $("#q-qty").value, paidStatus: $("#q-paid").value, method: "Cash / Hand Payment"
  }).then(function (r) {
    btnBusy(btn, false);
    toast(r.ok ? "Added (" + r.orderId + ")" : (r.error || "Error"), !r.ok);
    if (r.ok) { $("#q-name").value = ""; $("#q-class").value = ""; $("#q-qty").value = 1; }
  });
}

/* ------------------------------ reports --------------------------------- */

let reportData = null;

function rangeParams(range) {
  const now = new Date();
  const ymd = function (d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  switch (range) {
    case "today": return { from: ymd(now), to: ymd(now) };
    case "yesterday": { const d = new Date(now); d.setDate(d.getDate() - 1); return { from: ymd(d), to: ymd(d) }; }
    case "7d": { const d = new Date(now); d.setDate(d.getDate() - 7); return { from: ymd(d), to: ymd(now) }; }
    case "30d": { const d = new Date(now); d.setDate(d.getDate() - 30); return { from: ymd(d), to: ymd(now) }; }
    case "month": { const d = new Date(now); d.setDate(1); return { from: ymd(d), to: ymd(now) }; }
    default: return { from: "", to: "" };
  }
}

async function runReport() {
  const btn = $("#report-run");
  if (btn.disabled) return;
  const type = $("#report-type").value;
  const range = rangeParams($("#report-range").value);
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span>Generating…';
  $("#report-output").innerHTML = '<div class="card">' + statSkeleton(4) + tableSkeleton(5, 5) + "</div>";
  try {
    const r = await adminApi("reports", { reportType: type, from: range.from, to: range.to });
    if (!r.ok) { toast(r.error || "Error", true); $("#report-output").innerHTML = ""; return; }
    reportData = r;
    renderReport(r);
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate";
  }
}

function renderReport(r) {
  const el = $("#report-output");
  el.classList.add("report-doc");
  el.innerHTML =
    '<h1>KEGALU VIDYALAYA SCIENCE SOCIETY</h1><div class="sub">SHIRT DROP 2026 — ' + esc(r.type.toUpperCase()) + "</div>" +
    '<div class="report-meta">' +
    "<span>Generated: " + esc(r.generatedAt) + "</span>" +
    "<span>By: " + esc(r.generatedBy) + "</span></div>" +
    '<div class="stat-grid" style="margin-top:16px">' +
    statCard("Total orders", r.totalOrders) +
    statCard("Total shirts", r.totalShirts) +
    statCard("Paid", money(r.paidAmount)) +
    statCard("Pending", money(r.pendingAmount)) + "</div>" +
    '<h2>Design breakdown</h2>' +
    '<table class="report-table"><tr><th>Design</th><th>Orders</th><th>Shirts</th><th>Paid</th><th>Pending</th></tr>' +
    r.designStats.map(function (d) { return "<tr><td>" + esc(d.design) + "</td><td>" + d.orders + "</td><td>" + d.shirts + "</td><td>" + money(d.paid) + "</td><td>" + money(d.pending) + "</td></tr>"; }).join("") +
    "</table>" +
    '<h2>Size breakdown</h2>' +
    '<table class="report-table"><tr>' +
    SHIRT_SIZES.map(function (s) { return "<th>" + s + "</th>"; }).join("") + "</tr><tr>" +
    SHIRT_SIZES.map(function (s) { return "<td>" + (r.sizeStats[s] || 0) + "</td>"; }).join("") + "</tr></table>" +
    '<h2>Batch breakdown</h2>' +
    '<table class="report-table"><tr>' +
    BATCH_OPTIONS.map(function (b) { return "<th>" + b + "</th>"; }).join("") + "</tr><tr>" +
    BATCH_OPTIONS.map(function (b) { return "<td>" + ((r.batchStats && r.batchStats[b]) || 0) + "</td>"; }).join("") + "</tr></table>";

  if (r.type === "customer" || r.type === "sales") {
    el.innerHTML += '<h2>Orders</h2><table class="report-table"><tr><th>Order</th><th>Name</th><th>Class</th><th>Batch</th><th>Design</th><th>Size</th><th>Qty</th><th>Total</th><th>Status</th></tr>' +
      r.orders.map(function (o) { return "<tr><td>" + esc(o.OrderID) + "</td><td>" + esc(o.Name) + "</td><td>" + esc(o.GradeClass) + "</td><td>" + esc(batchText(o.Batch)) + "</td><td>" + esc(o.Design) + "</td><td>" + esc(o.Size) + "</td><td>" + esc(o.Qty) + "</td><td>" + money(o.Total) + "</td><td>" + esc(o.Status) + "</td></tr>"; }).join("") + "</table>";
  }
}

function csvDownload() {
  if (!reportData) { toast("Generate a report first", true); return; }
  const rows = [["Order", "Name", "Class", "Contact", "Design", "Size", "Qty", "Total", "Source", "Status", "Date"]];
  reportData.orders.forEach(function (o) {
    rows.push([o.OrderID, o.Name, o.GradeClass, o.Contact, o.Design, o.Size, o.Qty, o.Total, o.Source, o.Status, o.CreatedAt]);
  });
  const csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = "kvss-report.csv";
  a.click();
}

/* ----------------------------- production ------------------------------- */

function renderProductionSkeleton() {
  let out = "";
  for (let i = 0; i < 2; i++) {
    out += '<div class="prod-card">' + skLine("28%") + '<div class="sk" style="height:26px;width:45%"></div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:12px 0">' +
      sk("100%", "84px") + sk("100%", "84px") + sk("100%", "84px") + "</div>" + skLine("50%") + "</div>";
  }
  $("#production-output").innerHTML = out + '<div class="grand-total">' + skLine("40%") + "</div>";
}

function renderProduction(summary) {
  const names = { "Design 01": "2027 Edition", "Design 02": "2026 Edition" };
  const out = $("#production-output");

  const batchCards = BATCH_OPTIONS.map(function (b) {
    const bb = (summary.batches && summary.batches[b]) || { sizes: {}, total: 0 };
    return '<div class="prod-card">' +
      '<div class="prod-design">Batch</div>' +
      '<div class="prod-title">' + esc(b) + "</div>" +
      '<div class="prod-sizes">' +
      SHIRT_SIZES.map(function (sz) {
        return '<div class="prod-size"><div class="n">' + ((bb.sizes && bb.sizes[sz]) || 0) + '</div><div class="l">' + sz + "</div></div>";
      }).join("") + "</div>" +
      '<div class="prod-total">Total: <strong>' + (bb.total || 0) + " shirts</strong></div></div>";
  }).join("");

  const designCards = Object.keys(summary.designs).map(function (k) {
    const dd = summary.designs[k];
    return '<div class="prod-card">' +
      '<div class="prod-design">' + esc(k) + "</div>" +
      '<div class="prod-title">' + esc(names[k] || k) + "</div>" +
      '<div class="prod-sizes">' +
      SHIRT_SIZES.map(function (sz) {
        return '<div class="prod-size"><div class="n">' + (dd.sizes[sz] || 0) + '</div><div class="l">' + sz + "</div></div>";
      }).join("") + "</div>" +
      '<div class="prod-total">Total: <strong>' + dd.total + " shirts</strong></div></div>";
  }).join("");

  out.innerHTML = batchCards + designCards +
    '<div class="grand-total">TOTAL SHIRTS: ' + summary.totalShirts + "</div>";
}

async function loadProduction(seq, force) {
  renderProductionSkeleton();
  setContentBusy(true);
  try {
    const d = await adminApi("productionSummary");
    if (seq !== navSeq) return;
    if (!d.ok) { showSectionError(); return; }
    renderProduction(d.summary);
  } catch (e) {
    if (seq === navSeq) showSectionError();
  } finally {
    if (seq === navSeq) setContentBusy(false);
  }
}

/* ------------------------------ settings -------------------------------- */

function loadSettings() {
  $("#pw-save").onclick = function () {
    if ($("#pw-next").value !== $("#pw-confirm").value) { toast("Passwords do not match", true); return; }
    adminApi("changePassword", { current: $("#pw-current").value, next: $("#pw-next").value }).then(function (r) {
      toast(r.ok ? "Password updated" : (r.error || "Error"), !r.ok);
      if (r.ok) { $("#pw-current").value = ""; $("#pw-next").value = ""; $("#pw-confirm").value = ""; }
    });
  };
  adminApi("settings").then(function (r) {
    if (r.ok) {
      const prices = r.prices || DESIGN_PRICES;
      $("#settings-price").textContent = "Design 01 — " + money(prices["Design 01"]) + " · Design 02 — " + money(prices["Design 02"]);
      $("#settings-version").textContent = r.version || "unknown";
    } else {
      $("#settings-version").textContent = "unavailable";
    }
  }).catch(function () { $("#settings-version").textContent = "unavailable"; });
}

/* ---------------------------- notifications ----------------------------- */

async function loadNotifications() {
  try {
    const d = await adminApi("auditLog");
    if (!d.ok) return;
    const recent = d.log.slice(0, 6);
    const panel = $("#notif-panel");
    panel.innerHTML = recent.length
      ? recent.map(function (l) {
        return '<div class="notif-item"><b>' + esc(l.Action) + "</b>" + (l.OrderID ? " · " + esc(l.OrderID) : "") +
          "<span>" + esc(l.Timestamp) + "</span></div>";
      }).join("")
      : '<div class="notif-empty">No recent activity.</div>';
    $("#bell-dot").hidden = recent.length === 0;
  } catch (e) { /* ignore */ }
}

/* ------------------------------ wiring ---------------------------------- */

function wireEvents() {
  $("#login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (authBusy) return;
    authBusy = true;
    showAuthLoading();
    login($("#login-user").value, $("#login-pass").value, $("#login-remember").checked);
  });
  $("#pass-toggle").addEventListener("click", function () {
    const p = $("#login-pass");
    p.type = p.type === "password" ? "text" : "password";
    this.textContent = p.type === "password" ? "Show" : "Hide";
  });
  $("#logout-btn").addEventListener("click", logout);

  $$(".side-link").forEach(function (l) {
    l.addEventListener("click", function () { showView(l.getAttribute("data-view")); });
  });
  $$("[data-goto]").forEach(function (a) {
    a.addEventListener("click", function () { showView(a.getAttribute("data-goto")); });
  });

  $("#menu-btn").addEventListener("click", function () { $("#sidebar").classList.toggle("open"); });
  $("#drawer-close").addEventListener("click", closeDrawer);
  $("#drawer-backdrop").addEventListener("click", closeDrawer);
  $("#modal-backdrop").addEventListener("click", closeModal);

  $("#lightbox-close").addEventListener("click", closeLightbox);
  $("#lightbox").addEventListener("click", function (e) { if (e.target === $("#lightbox")) closeLightbox(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("#lightbox").hidden) closeLightbox();
  });

  $("#refresh-btn").addEventListener("click", refreshDashboard);
  $("#section-retry").addEventListener("click", function () { showView(currentView, true); });
  $("#new-manual-btn").addEventListener("click", function () { showView("manual"); });

  $("#order-search").addEventListener("input", function () { renderOrders(state.cache.orders || []); });
  $("#order-filter-status").addEventListener("change", function () { renderOrders(state.cache.orders || []); });
  $("#order-filter-design").addEventListener("change", function () { renderOrders(state.cache.orders || []); });
  $("#order-filter-source").addEventListener("change", function () { renderOrders(state.cache.orders || []); });

  $("#global-search").addEventListener("input", function () {
    $("#order-search").value = this.value;
    if ($("#app").hidden) return;
    showView("preorders");
    if (state.cache.orders) renderOrders(state.cache.orders);
  });

  $("#bell-btn").addEventListener("click", function () { $("#notif-panel").hidden = !$("#notif-panel").hidden; });

  $("#report-run").addEventListener("click", runReport);
  $("#report-csv").addEventListener("click", csvDownload);
  $("#report-print").addEventListener("click", function () { window.print(); });
  $("#prod-print").addEventListener("click", function () { window.print(); });

  // delegated clicks
  document.addEventListener("click", function (e) {
    const openBtn = e.target.closest("[data-open-slip]");
    if (openBtn) { openReceiptFile(openBtn.getAttribute("data-open-slip")); return; }
    const retryBtn = e.target.closest("[data-drawer-retry]");
    if (retryBtn) { if (drawerRetry) drawerRetry(); return; }
    const viewBtn = e.target.closest("button[data-view]");
    if (viewBtn) { openOrder(viewBtn.getAttribute("data-view")); return; }
    const reviewBtn = e.target.closest("button.btn-primary[data-slip]");
    if (reviewBtn) { openSlipReview(reviewBtn.getAttribute("data-slip")); return; }
    const preview = e.target.closest(".slip-preview");
    if (preview) { onPreviewClick(preview); return; }
    const gotoOrder = e.target.closest("[data-goto-order]");
    if (gotoOrder) { openOrder(gotoOrder.getAttribute("data-goto-order")); return; }
    const row = e.target.closest("tr[data-order]");
    if (row) { openOrder(row.getAttribute("data-order")); }
  });
}

function init() {
  wireEvents();
  tryResume();
}

init();

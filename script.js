// BACKEND: Supabase Edge Function (see supabase/functions/api/index.ts)
// After deploying it, replace this URL with:
//   https://<PROJECT-REF>.supabase.co/functions/v1/api
// (Full instructions: SETUP.md)
const API_URL = "https://trwbafwaggbjmciqvcgf.supabase.co/functions/v1/api";

// Single source of truth for design data (name, price, edition, image).
const DESIGNS = {
  "Design 01": { name: "Design 01", price: 2200, edition: "2027 Edition", image: "f1.png" },
  "Design 02": { name: "Design 02", price: 2500, edition: "2026 Edition", image: "f2.png" }
};

const PAYMENT_DETAILS = {
  bankName: "Bank of Ceylon",
  accountNumber: "0096525378",
  branch: "Galigamuwa Branch (314)",
  accountHolder: "MR V R R M MAHANAMA"
};

// Single source of truth for shirt sizes + size chart (all measurements in inches).
const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const BATCH_OPTIONS = ["2026 Batch", "2027 Batch"];

const SIZE_CHART = [
  { label: "Chest", values: ["33\" / 34\"", "35\"", "36\" / 36.5\"", "37\" / 38\" / 39\" / 40\"", "41\" / 42\" / 43\"", "44\" / 45\" / 46\""] },
  { label: "Height", values: ["24\"", "26\"", "27.5\"", "28.5\"", "30.5\"", "30.5\""] }
];

function formatLKR(n) { return "LKR " + n.toLocaleString("en-US"); }

/* ---------- Design prices (single source of truth) ---------- */
const DESIGN_NUM_TO_KEY = { "1": "Design 01", "2": "Design 02" };

function renderDesignPrices() {
  document.querySelectorAll(".design-card").forEach(function (card) {
    const key = DESIGN_NUM_TO_KEY[card.getAttribute("data-design")];
    const el = card.querySelector(".design-price");
    if (el && key && DESIGNS[key]) el.textContent = formatLKR(DESIGNS[key].price);
  });
}

/* ---------- Size selector (single source of truth) ---------- */
function renderSizeButtons() {
  const el = document.getElementById("size-segmented");
  if (!el) return;
  el.innerHTML = SHIRT_SIZES.map(function (s) {
    return '<button type="button" class="size-btn" data-size="' + s + '">' + s + "</button>";
  }).join("");
}

function renderBatchButtons() {
  const el = document.getElementById("batch-segmented");
  if (!el) return;
  el.innerHTML = BATCH_OPTIONS.map(function (b) {
    return '<button type="button" class="batch-btn" data-batch="' + b + '">' + b + "</button>";
  }).join("");
}

function renderSizeChart() {
  const body = document.getElementById("size-table-body");
  if (!body) return;
  body.innerHTML = SIZE_CHART.map(function (row) {
    return "<tr><td>" + row.label + "</td>" +
      row.values.map(function (v) { return "<td>" + v + "</td>"; }).join("") + "</tr>";
  }).join("");
}

function setupSizeChartModal() {
  const modal = document.getElementById("size-modal");
  const backdrop = document.getElementById("size-modal-backdrop");
  const openBtn = document.getElementById("size-chart-btn");
  const closeBtn = document.getElementById("size-modal-close");
  if (!modal || !backdrop) return;

  const close = function () { modal.hidden = true; backdrop.hidden = true; document.body.style.overflow = ""; };
  const open = function () { modal.hidden = false; backdrop.hidden = false; document.body.style.overflow = "hidden"; };

  if (openBtn) openBtn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) close();
  });
}

/* ---------- Payment details (single source of truth) ---------- */
function renderPaymentDetails() {
  const el = document.getElementById("payment-details");
  if (!el) return;
  el.innerHTML =
    '<div class="payment-card">' +
      '<div class="payment-head">' +
        '<span class="payment-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg></span>' +
        '<div>' +
          '<h4 class="payment-title">Bank Transfer</h4>' +
          '<p class="payment-sub">Please make the payment to the bank account below and upload your bank slip after completing the payment.</p>' +
        '</div>' +
      '</div>' +
      '<div class="payment-grid">' +
        '<div class="pay-row"><span class="pay-label">Bank</span><span class="pay-value">' + PAYMENT_DETAILS.bankName + '</span></div>' +
        '<div class="pay-row"><span class="pay-label">Account number</span>' +
          '<span class="pay-value pay-account"><span class="pay-account-num">' + PAYMENT_DETAILS.accountNumber + '</span>' +
          '<button type="button" class="pay-copy" id="copy-account" aria-label="Copy account number">Copy</button></span></div>' +
        '<div class="pay-row"><span class="pay-label">Branch</span><span class="pay-value">' + PAYMENT_DETAILS.branch + '</span></div>' +
        '<div class="pay-row"><span class="pay-label">Account holder</span><span class="pay-value">' + PAYMENT_DETAILS.accountHolder + '</span></div>' +
      '</div>' +
      '<div class="payment-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg><span>After completing the bank transfer, upload a clear photo or PDF of your bank slip below.</span></div>' +
    '</div>';

  const btn = document.getElementById("copy-account");
  if (btn) btn.addEventListener("click", function () { copyAccountNumber(PAYMENT_DETAILS.accountNumber, btn); });
}

function copyAccountNumber(value, btn) {
  const finish = function () {
    btn.textContent = "Copied";
    btn.classList.add("copied");
    setTimeout(function () { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value).then(finish, function () { fallbackCopy(value); finish(); });
  } else {
    fallbackCopy(value);
    finish();
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  document.body.removeChild(ta);
}

renderPaymentDetails();
renderDesignPrices();
renderSizeButtons();
renderBatchButtons();
renderSizeChart();
setupSizeChartModal();

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- Design gallery: 3D flip + swipe + tilt ---------- */
document.querySelectorAll(".design-card").forEach((card) => {
  const viewer = card.querySelector(".design-viewer");
  const flip = card.querySelector(".design-flip");
  const buttons = card.querySelectorAll(".view-btn");
  const faces = ["front", "back"];
  let current = 0;

  function setFace(face) {
    current = faces.indexOf(face);
    flip.classList.toggle("flipped", face === "back");
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.face === face));
  }

  function next() { setFace(faces[(current + 1) % faces.length]); }
  function prev() { setFace(faces[(current - 1 + faces.length) % faces.length]); }

  buttons.forEach((b) => b.addEventListener("click", () => setFace(b.dataset.face)));

  let startX = null;
  let startY = null;

  viewer.addEventListener("pointerdown", (e) => {
    startX = e.clientX;
    startY = e.clientY;
    viewer.setPointerCapture(e.pointerId);
  });

  viewer.addEventListener("pointermove", (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > Math.abs(dy)) e.preventDefault();
  });

  viewer.addEventListener("pointerup", (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next(); else prev();
    }
    startX = null;
    startY = null;
  });

  viewer.addEventListener("pointercancel", () => {
    startX = null;
    startY = null;
  });
});

/* ---------- Mouse parallax tilt (hover-capable devices only) ---------- */
if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
  document.querySelectorAll(".design-card").forEach((card) => {
    const viewer = card.querySelector(".design-viewer");
    const tilt = card.querySelector(".design-tilt");
    if (!viewer || !tilt) return;
    card.addEventListener("mousemove", (e) => {
      const r = viewer.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      tilt.style.setProperty("--tiltY", (px * 6).toFixed(2) + "deg");
      tilt.style.setProperty("--tiltX", (-py * 4).toFixed(2) + "deg");
    });
    card.addEventListener("mouseleave", () => {
      tilt.style.setProperty("--tiltY", "0deg");
      tilt.style.setProperty("--tiltX", "0deg");
    });
  });
}

/* ---------- Scroll reveal ---------- */
document.documentElement.classList.add("js");
const revealEls = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add("is-visible"));
}

/* ---------- Preorder form ---------- */
const form = document.getElementById("order-form");
const successBox = document.getElementById("pre-success");
const successText = document.getElementById("success-text");

const designButtons = document.querySelectorAll(".design-btn");
const sizeButtons = document.querySelectorAll(".size-btn");
const batchButtons = document.querySelectorAll(".batch-btn");
const qtyValue = document.getElementById("qty-value");
const qtyMinus = document.getElementById("qty-minus");
const qtyPlus = document.getElementById("qty-plus");

const summaryDesign = document.getElementById("summary-design");
const summarySize = document.getElementById("summary-size");
const summaryBatch = document.getElementById("summary-batch");
const summaryThumb = document.getElementById("summary-thumb");
const summaryQty = document.getElementById("summary-qty");
const summaryPrice = document.getElementById("summary-price");
const summaryTotal = document.getElementById("summary-total");

const state = { design: "Design 01", size: null, batch: null, qty: 1 };

function updateSummary() {
  const design = DESIGNS[state.design];
  const price = design ? design.price : 0;
  summaryDesign.textContent = design ? design.edition : (state.design || "No design selected");
  summarySize.textContent = state.size || "Choose size";
  summaryBatch.textContent = state.batch || "No batch selected";
  summaryQty.textContent = state.qty;
  summaryPrice.textContent = formatLKR(price);
  summaryTotal.textContent = formatLKR(price * state.qty);
  qtyValue.textContent = state.qty;
  qtyMinus.disabled = state.qty <= 1;

  if (design && design.image) {
    summaryThumb.innerHTML = '<img src="' + design.image + '" alt="' + state.design + '" />';
  } else {
    summaryThumb.innerHTML = "";
  }
}

function setError(name, msg) {
  const el = document.querySelector('[data-error="' + name + '"]');
  if (el) { el.textContent = msg; el.classList.add("show"); }
}
function clearError(name) {
  const el = document.querySelector('[data-error="' + name + '"]');
  if (el) { el.textContent = ""; el.classList.remove("show"); }
}
function setInvalid(inputId, invalid) {
  const field = document.getElementById(inputId).closest(".pre-field");
  if (field) field.classList.toggle("invalid", invalid);
}

designButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.design = btn.dataset.design;
    designButtons.forEach((b) => b.classList.toggle("selected", b === btn));
    clearError("design");
    updateSummary();
  });
});

sizeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.size = btn.dataset.size;
    sizeButtons.forEach((b) => b.classList.toggle("selected", b === btn));
    clearError("size");
    updateSummary();
  });
});

batchButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.batch = btn.dataset.batch;
    batchButtons.forEach((b) => b.classList.toggle("selected", b === btn));
    clearError("batch");
    updateSummary();
  });
});

qtyPlus.addEventListener("click", () => { state.qty++; updateSummary(); });
qtyMinus.addEventListener("click", () => { if (state.qty > 1) { state.qty--; updateSummary(); } });

/* ---------- Bank slip upload ---------- */
const bankSlipInput = document.getElementById("bank-slip");
const uploadDrop = document.getElementById("upload-drop");
const uploadEmpty = document.getElementById("upload-empty");
const uploadFile = document.getElementById("upload-file");
const uploadFileName = document.getElementById("upload-file-name");
const uploadFileSize = document.getElementById("upload-file-size");
const uploadFileIcon = document.getElementById("upload-file-icon");
const uploadRemove = document.getElementById("upload-remove");

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
let bankSlipFile = null; // kept in memory for future backend integration (multipart/form-data)
let objectUrl = null;

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function setUploadError(msg) {
  const el = document.querySelector('[data-error="bank-slip"]');
  if (el) { el.textContent = msg || ""; el.classList.toggle("show", !!msg); }
}

function showFile(file) {
  bankSlipFile = file;
  uploadFileName.textContent = file.name;
  uploadFileSize.textContent = formatBytes(file.size);
  if (file.type === "application/pdf") {
    uploadFileIcon.textContent = "PDF";
    uploadFileIcon.className = "upload-file-icon";
  } else {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    uploadFileIcon.innerHTML = '<img src="' + objectUrl + '" alt="Bank slip preview" />';
    uploadFileIcon.className = "upload-file-icon";
  }
  uploadEmpty.hidden = true;
  uploadFile.hidden = false;
  setUploadError("");
}

function clearFile() {
  bankSlipFile = null;
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  uploadFileIcon.innerHTML = "";
  uploadEmpty.hidden = false;
  uploadFile.hidden = true;
  bankSlipInput.value = "";
  setUploadError("");
}

function handleFile(file) {
  if (!file) return;
  if (ALLOWED_TYPES.indexOf(file.type) === -1) {
    setUploadError("Please upload a JPG, PNG, WEBP, or PDF file.");
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    setUploadError("File is too large. Maximum size is 5 MB.");
    return;
  }
  showFile(file);
}

uploadDrop.addEventListener("click", () => bankSlipInput.click());
uploadDrop.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    bankSlipInput.click();
  }
});
bankSlipInput.addEventListener("change", () => handleFile(bankSlipInput.files[0]));

uploadRemove.addEventListener("click", (e) => {
  e.stopPropagation();
  clearFile();
});

["dragenter", "dragover"].forEach((ev) => {
  uploadDrop.addEventListener(ev, (e) => { e.preventDefault(); uploadDrop.classList.add("drag-over"); });
});
["dragleave", "drop"].forEach((ev) => {
  uploadDrop.addEventListener(ev, (e) => { e.preventDefault(); uploadDrop.classList.remove("drag-over"); });
});
uploadDrop.addEventListener("drop", (e) => {
  const files = e.dataTransfer.files;
  if (files && files.length) handleFile(files[0]);
});

updateSummary();

["name", "grade", "phone"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    clearError(id);
    setInvalid(id, false);
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const grade = document.getElementById("grade").value.trim();
  const phone = document.getElementById("phone").value.trim();
  let valid = true;

  if (!name) { setError("name", "Please enter your full name."); setInvalid("name", true); valid = false; }
  if (!grade) { setError("grade", "Required."); setInvalid("grade", true); valid = false; }
  if (!phone) { setError("phone", "Required."); setInvalid("phone", true); valid = false; }
  if (!state.batch) { setError("batch", "Please select a batch."); valid = false; }
  if (!state.design) { setError("design", "Please choose a design."); valid = false; }
  if (!state.size) { setError("size", "Please select a shirt size."); valid = false; }
  if (!bankSlipFile) { setUploadError("Please upload your bank slip before placing the preorder."); valid = false; }

  if (!valid) return;

  const submitBtn = document.getElementById("place-order");
  const submitError = document.getElementById("submit-error");
  submitError.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  try {
    const slipData = await fileToBase64(bankSlipFile);
    const payload = {
      action: "submitOrder",
      name: name,
      gradeClass: grade,
      contact: phone,
      batch: state.batch,
      design: state.design,
      size: state.size,
      quantity: state.qty,
      note: document.getElementById("notes").value.trim(),
      bankSlip: { name: bankSlipFile.name, type: bankSlipFile.type, data: slipData }
    };
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!result.ok) {
      submitError.textContent = result.error || "Something went wrong. Please try again.";
      submitError.hidden = false;
      return;
    }
    successText.textContent =
      "Thanks, " + name + "! Your preorder (" + result.orderId + ") for " + DESIGNS[state.design].edition +
      " · " + state.batch + " · " + state.size + " (×" + state.qty + ") has been received. We'll confirm it soon.";
    successBox.hidden = false;
    successBox.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) {
    submitError.textContent = "Unable to submit. Please check your connection and try again.";
    submitError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Place preorder";
  }
});

document.getElementById("year").textContent = new Date().getFullYear();

const navToggle = document.getElementById("nav-toggle");
const navLinks = document.getElementById("nav-links");
const navBackdrop = document.getElementById("nav-backdrop");
if (navToggle && navLinks) {
  const closeMenu = function () {
    navLinks.classList.remove("open");
    navToggle.classList.remove("active");
    navToggle.setAttribute("aria-expanded", "false");
    if (navBackdrop) navBackdrop.classList.remove("show");
    document.body.classList.remove("menu-open");
  };
  navToggle.addEventListener("click", () => {
    const open = !navLinks.classList.contains("open");
    navLinks.classList.toggle("open", open);
    navToggle.classList.toggle("active", open);
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (navBackdrop) navBackdrop.classList.toggle("show", open);
    document.body.classList.toggle("menu-open", open);
  });
  if (navBackdrop) navBackdrop.addEventListener("click", closeMenu);
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });
}

const preorderLink = document.querySelector('.nav-links a[href="#order"]:not(.nav-cta)');
const preorderSection = document.getElementById("order");
const navbar = document.querySelector(".navbar");

if (preorderLink && preorderSection && navbar) {
  preorderLink.addEventListener("click", (e) => {
    e.preventDefault();
    const headerHeight = navbar.offsetHeight;
    const targetY = preorderSection.getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo({ top: targetY, behavior: "smooth" });
    if (history.pushState) history.pushState(null, "", "#order");
  });
}

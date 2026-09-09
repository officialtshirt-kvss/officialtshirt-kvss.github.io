/**
 * ============================================================================
 *  KEGALU VIDYALAYA SCIENCE SOCIETY — SHIRT DROP 2026 · ADMIN BACKEND
 * ============================================================================
 *  Backend: Google Apps Script → Google Sheets (database) + Google Drive (slips)
 *
 *  HOW TO DEPLOY
 *  -------------
 *  1. Open https://script.google.com → New project.
 *  2. Paste this whole file into Code.gs.
 *  3. Deploy → New deployment → type "Web app".
 *       - Execute as:       Me
 *       - Who has access:   Anyone
 *  4. Copy the resulting "Web app URL" (ends with /exec).
 *  5. Open that URL once in a browser → it creates the spreadsheet (Orders,
 *     Payments, Bank Slips, Admins, Audit Log, Settings) + a private Drive
 *     folder, and seeds the default admin.
 *  6. Paste the /exec URL into:
 *       - admin/admin.js   →  const API_URL = "..."
 *       - script.js (public site) → const API_URL = "..."
 *  7. Log in and immediately change the default password in Settings.
 *       Default:  admin / kvss2026
 * ============================================================================
 */

const SHEET_ORDERS   = 'Orders';
const SHEET_PAYMENTS = 'Payments';
const SHEET_SLIPS    = 'Bank Slips';
const SHEET_ADMINS   = 'Admins';
const SHEET_AUDIT    = 'Audit Log';
const SHEET_SETTINGS = 'Settings';

const BACKEND_VERSION = '2.0.0'; // bump whenever you change Code.gs, to verify the deployed version

const DRIVE_FOLDER_NAME = 'KVSS_BankSlips';
const SESSION_TTL = 60 * 60; // seconds

const ORDERS_HEADER   = ['OrderID','Name','GradeClass','Contact','Batch','Design','Size','Qty','Price','Total','Source','Status','Note','CreatedAt'];
const PAYMENTS_HEADER = ['OrderID','Amount','Method','Status','VerificationStatus','PaymentDate','PaymentTime','VerifiedBy','VerifiedAt','Reference','Notes'];
const SLIPS_HEADER    = ['SlipID','OrderID','FileName','FileType','DriveFileID','UploadedAt','Status','ReviewedBy','ReviewedAt','RejectionReason'];
const ADMINS_HEADER   = ['Name','Email','Salt','PasswordHash','Role','CreatedAt','LastLogin'];
const AUDIT_HEADER    = ['Timestamp','Admin','Action','OrderID','Detail'];
const SETTINGS_HEADER = ['Key','Value'];

const DEFAULT_PRICE = 2200;
const DESIGN_PRICES = { 'Design 01': 2200, 'Design 02': 2500 };
const MAX_SLIP_BYTES = 5 * 1024 * 1024;
const ALLOWED_SLIP_TYPES = ['image/jpeg','image/png','image/webp','application/pdf'];

const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SIZE_ALIASES = { 'Small': 'S', 'Medium': 'M', 'Large': 'L' };
const BATCH_OPTIONS = ['2026 Batch', '2027 Batch'];
const BATCH_ALIASES = { '2026 Badge': '2026 Batch', '2027 Badge': '2027 Batch' };

function normalizeBatch(b) {
  return BATCH_ALIASES[b] || b;
}

function normalizeSize(size) {
  return SIZE_ALIASES[size] || size;
}

const PAID_STATUSES = ['Paid','Manually Paid','Confirmed'];

// Column maps built from the header constants (no sheet read needed).
const HEADERS = {
  Orders: ORDERS_HEADER,
  Payments: PAYMENTS_HEADER,
  'Bank Slips': SLIPS_HEADER,
  Admins: ADMINS_HEADER,
  'Audit Log': AUDIT_HEADER,
  Settings: SETTINGS_HEADER
};

const CACHE_TTL_DASHBOARD = 30;   // seconds
const CACHE_TTL_SETTINGS = 300;   // seconds

/* ============================== SETUP ==================================== */

function getProps() { return PropertiesService.getScriptProperties(); }

function getSpreadsheet() {
  const props = getProps();
  let id = props.getProperty('SPREADSHEET_ID');
  if (!id) {
    const ss = SpreadsheetApp.create('KVSS Shirt Drop 2026 — Data');
    id = ss.getId();
    props.setProperty('SPREADSHEET_ID', id);
  }
  return SpreadsheetApp.openById(id);
}

function ensureSheet(name, header) {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (header && header.length) sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  _sheetCache[name] = sh;
  return sh;
}

function getDriveFolder() {
  const props = getProps();
  let id = props.getProperty('SLIPS_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* recreate */ }
  }
  const it = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (it.hasNext()) {
    const f = it.next();
    props.setProperty('SLIPS_FOLDER_ID', f.getId());
    return f;
  }
  const f = DriveApp.createFolder(DRIVE_FOLDER_NAME);
  f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  props.setProperty('SLIPS_FOLDER_ID', f.getId());
  return f;
}

function seedAdmin() {
  const sh = ensureSheet(SHEET_ADMINS, ADMINS_HEADER);
  if (sh.getLastRow() <= 1) {
    const salt = Utilities.getUuid().slice(0, 12);
    sh.appendRow(['Administrator', 'admin', salt, hashPassword('kvss2026', salt), 'Super Admin', now(), '']);
  }
}

function ensureSettings() {
  ensureSheet(SHEET_SETTINGS, SETTINGS_HEADER);
  const data = readSheetValues(SHEET_SETTINGS);
  const keys = data.map(function (r) { return r[0]; });
  if (keys.indexOf('PricePerShirt') === -1) getSheet(SHEET_SETTINGS).appendRow(['PricePerShirt', DEFAULT_PRICE]);
}

function ensureBatchColumn() {
  const sh = getSheet(SHEET_ORDERS);
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return;
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  if (header.indexOf('Batch') !== -1) return; // already migrated
  const oldIdx = header.indexOf('Badge');
  if (oldIdx !== -1) {
    sh.getRange(1, oldIdx + 1).setValue('Batch'); // rename legacy "Badge" column to "Batch"
    return;
  }
  const contactIdx = header.indexOf('Contact');
  if (contactIdx < 0) return;
  sh.insertColumn(contactIdx + 2); // 1-based position right after "Contact"
  sh.getRange(1, contactIdx + 2).setValue('Batch');
}

function ensureSetup() {
  ensureSheet(SHEET_ORDERS, ORDERS_HEADER);
  ensureSheet(SHEET_PAYMENTS, PAYMENTS_HEADER);
  ensureSheet(SHEET_SLIPS, SLIPS_HEADER);
  ensureSheet(SHEET_ADMINS, ADMINS_HEADER);
  ensureSheet(SHEET_AUDIT, AUDIT_HEADER);
  ensureSheet(SHEET_SETTINGS, SETTINGS_HEADER);
  getDriveFolder();
  seedAdmin();
  ensureSettings();
  ensureBatchColumn();
}

function now() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ============================== HELPERS ================================== */

function hashPassword(password, salt) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + password);
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

// Request-scoped handles (reset per execution) — avoid repeated getSheetByName/openById.
let _ss = null;
const _sheetCache = {};

function getSheet(name) {
  if (!_sheetCache[name]) {
    if (!_ss) _ss = getSpreadsheet();
    _sheetCache[name] = _ss.getSheetByName(name);
  }
  return _sheetCache[name];
}

function readSheetValues(name) {
  const sh = getSheet(name);
  const lastRow = sh.getLastRow();
  if (lastRow < 1) return [];
  const lastCol = sh.getLastColumn() || 1;
  return sh.getRange(1, 1, lastRow, lastCol).getValues();
}

function readAll(name) {
  const values = readSheetValues(name);
  if (values.length <= 1) return [];
  const header = HEADERS[name] || values[0];
  return values.slice(1).map(function (row) {
    const o = {};
    header.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  });
}

function appendRow(name, values) { getSheet(name).appendRow(values); }

function colIndex(name, col) { return (HEADERS[name] || []).indexOf(col); }

function findRow(name, col, value) {
  const c = colIndex(name, col);
  if (c < 0) return -1;
  const values = readSheetValues(name);
  for (let i = 1; i < values.length; i++) if (String(values[i][c]) === String(value)) return i;
  return -1;
}

function setCell(name, row, col, value) {
  const c = colIndex(name, col);
  if (c < 0) return;
  getSheet(name).getRange(row + 1, c + 1).setValue(value);
}

function getSetting(key) {
  const rows = readAll(SHEET_SETTINGS);
  const r = rows.find(function (x) { return x.Key === key; });
  return r ? r.Value : null;
}

function setSetting(key, value) {
  const idx = findRow(SHEET_SETTINGS, 'Key', key);
  if (idx >= 0) setCell(SHEET_SETTINGS, idx, 'Value', value);
  else appendRow(SHEET_SETTINGS, [key, value]);
  bumpDataVersion();
}

function getPrice(design) {
  if (design && DESIGN_PRICES[design] != null) return DESIGN_PRICES[design];
  const p = parseInt(getSetting('PricePerShirt'), 10);
  return isNaN(p) || p <= 0 ? DEFAULT_PRICE : p;
}

function nextOrderNumber(source) {
  const prefix = source === 'Manual' ? 'KVSS-M-' : 'KVSS-';
  const values = readSheetValues(SHEET_ORDERS);
  const c = colIndex(SHEET_ORDERS, 'OrderID');
  let max = 0;
  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][c] || '');
    if (id.indexOf(prefix) !== 0) continue;
    const n = parseInt(id.replace(prefix, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(4, '0');
}

function audit(admin, action, orderId, detail) {
  appendRow(SHEET_AUDIT, [now(), admin || 'system', action, orderId || '', detail || '']);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function authAdmin(token) {
  const email = CacheService.getScriptCache().get('token_' + token);
  if (!email) return null;
  return readAll(SHEET_ADMINS).find(function (a) { return String(a.Email) === String(email); }) || null;
}

/* ------------------------- cache + data version ------------------------- */

function getDataVersion() {
  const v = getProps().getProperty('DATA_VERSION');
  return v ? parseInt(v, 10) : 1;
}

function bumpDataVersion() {
  const props = getProps();
  const v = (parseInt(props.getProperty('DATA_VERSION'), 10) || 0) + 1;
  props.setProperty('DATA_VERSION', String(v));
  return v;
}

function cacheGet(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw == null ? null : JSON.parse(raw);
  } catch (e) { return null; }
}

function cachePut(key, value, ttl) {
  try { CacheService.getScriptCache().put(key, JSON.stringify(value), ttl || 60); } catch (e) {}
}

/* ============================== AUTH ===================================== */

function login(username, password) {
  ensureSetup();
  const admin = readAll(SHEET_ADMINS).find(function (a) {
    return String(a.Email).toLowerCase() === String(username).toLowerCase();
  });
  if (!admin) return { ok: false, error: 'Invalid credentials.' };
  if (hashPassword(password, admin.Salt) !== admin.PasswordHash) return { ok: false, error: 'Invalid credentials.' };
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('token_' + token, admin.Email, SESSION_TTL);
  const idx = findRow(SHEET_ADMINS, 'Email', admin.Email);
  if (idx >= 0) setCell(SHEET_ADMINS, idx, 'LastLogin', now());
  audit(admin.Email, 'Login', '', '');
  return { ok: true, token: token, admin: { name: admin.Name, email: admin.Email, role: admin.Role } };
}

/* ========================== ORDER SUBMISSION ============================= */

function submitOrder(data) {
  ensureSetup();
  const name = String(data.name || '').trim();
  const gradeClass = String(data.gradeClass || '').trim();
  const contact = String(data.contact || '').trim();
  const batch = String(data.batch || '').trim();
  const design = String(data.design || '').trim();
  const size = String(data.size || '').trim();
  const qty = Math.max(1, parseInt(data.quantity, 10) || 1);
  const note = String(data.note || '').trim();
  const slip = data.bankSlip || null;

  if (!name || !gradeClass || !contact || !batch || !design || !size) {
    return { ok: false, error: 'Missing required fields.' };
  }
  if (BATCH_OPTIONS.indexOf(batch) === -1) {
    return { ok: false, error: 'Please select a valid batch.' };
  }
  if (SHIRT_SIZES.indexOf(size) === -1) {
    return { ok: false, error: 'Please select a valid shirt size.' };
  }
  if (!slip || !slip.data || ALLOWED_SLIP_TYPES.indexOf(slip.type) === -1) {
    return { ok: false, error: 'A bank slip (JPG, PNG or PDF) is required.' };
  }
  // base64 length ≈ bytes * 4/3; reject oversized before decoding
  if (slip.data.length > Math.ceil(MAX_SLIP_BYTES * 4 / 3)) {
    return { ok: false, error: 'Bank slip is too large (max 5 MB).' };
  }

  return withLock(function () {
    const price = getPrice(design);
    const total = price * qty;
    const orderId = nextOrderNumber('Website');
    const ts = now();

    appendRow(SHEET_ORDERS, [orderId, name, gradeClass, contact, batch, design, size, qty, price, total, 'Website', 'Under Review', note, ts]);

    let slipId = '';
    try {
      const bytes = Utilities.base64Decode(slip.data);
      const blob = Utilities.newBlob(bytes, slip.type, slip.name || 'bank_slip');
      const file = getDriveFolder().createFile(blob);
      slipId = 'SLIP-' + Utilities.getUuid().slice(0, 8).toUpperCase();
      appendRow(SHEET_SLIPS, [slipId, orderId, slip.name || 'bank_slip', slip.type, file.getId(), ts, 'Pending Review', '', '', '']);
    } catch (e) {
      appendRow(SHEET_SLIPS, ['SLIP-' + Utilities.getUuid().slice(0, 8).toUpperCase(), orderId, slip.name || 'bank_slip', slip.type, '', ts, 'Error', '', '', '']);
    }

    appendRow(SHEET_PAYMENTS, [orderId, total, 'Bank Transfer', 'Under Review', 'Under Review', '', '', '', '', '', '']);
    audit('system', 'Order created (website)', orderId, name + ' · ' + batch + ' · ' + design + ' ' + size + ' ×' + qty);
    bumpDataVersion();

    return { ok: true, orderId: orderId, total: total };
  });
}

/* ============================== STATS ==================================== */

function dashboard(admin) {
  const cacheKey = 'dashboard_v' + getDataVersion();
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const orders = readAll(SHEET_ORDERS);
  const slips = readAll(SHEET_SLIPS);
  const prices = DESIGN_PRICES;

  const totalOrders = orders.length;
  const totalShirts = orders.reduce(function (s, o) { return s + (parseInt(o.Qty, 10) || 0); }, 0);
  const paid = orders.filter(function (o) { return PAID_STATUSES.indexOf(o.Status) >= 0; });
  const paidAmount = paid.reduce(function (s, o) { return s + (parseInt(o.Total, 10) || 0); }, 0);
  const pendingAmount = orders
    .filter(function (o) { return PAID_STATUSES.indexOf(o.Status) < 0 && o.Status !== 'Cancelled'; })
    .reduce(function (s, o) { return s + (parseInt(o.Total, 10) || 0); }, 0);
  const slipPending = slips.filter(function (s) { return s.Status === 'Pending Review'; }).length;
  const manualOrders = orders.filter(function (o) { return o.Source === 'Manual'; }).length;

  const statusCounts = {};
  orders.forEach(function (o) { statusCounts[o.Status || 'Unknown'] = (statusCounts[o.Status || 'Unknown'] || 0) + 1; });

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const count = orders.filter(function (o) { return String(o.CreatedAt).indexOf(key) === 0; }).length;
    days.push({ date: Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd MMM'), count: count });
  }

  const result = {
    ok: true,
    prices: prices,
    stats: {
      totalOrders: totalOrders, totalShirts: totalShirts,
      paidAmount: paidAmount, pendingAmount: pendingAmount,
      slipPending: slipPending, manualOrders: manualOrders
    },
    statusCounts: statusCounts,
    designStats: designStats(orders),
    sizeStats: sizeStats(orders),
    batchStats: batchStats(orders),
    ordersOverTime: days,
    recentOrders: orders.slice(-8).reverse()
  };

  cachePut(cacheKey, result, CACHE_TTL_DASHBOARD);
  return result;
}

function designStats(orders) {
  return ['Design 01', 'Design 02'].map(function (d) {
    const ds = orders.filter(function (o) { return o.Design === d; });
    const paid = ds.filter(function (o) { return PAID_STATUSES.indexOf(o.Status) >= 0; });
    return {
      design: d,
      orders: ds.length,
      shirts: ds.reduce(function (s, o) { return s + (parseInt(o.Qty, 10) || 0); }, 0),
      paid: paid.reduce(function (s, o) { return s + (parseInt(o.Total, 10) || 0); }, 0),
      pending: ds.filter(function (o) { return PAID_STATUSES.indexOf(o.Status) < 0 && o.Status !== 'Cancelled'; })
        .reduce(function (s, o) { return s + (parseInt(o.Total, 10) || 0); }, 0)
    };
  });
}

function sizeStats(orders) {
  const sizes = {};
  SHIRT_SIZES.forEach(function (s) { sizes[s] = 0; });
  orders.forEach(function (o) {
    const key = normalizeSize(o.Size);
    if (sizes[key] !== undefined) sizes[key] += (parseInt(o.Qty, 10) || 0);
  });
  return sizes;
}

function batchStats(orders) {
  const batches = {};
  BATCH_OPTIONS.forEach(function (b) { batches[b] = 0; });
  orders.forEach(function (o) {
    const b = normalizeBatch(o.Batch || '');
    if (batches[b] !== undefined) batches[b] += (parseInt(o.Qty, 10) || 0);
  });
  return batches;
}

/* ============================ ORDER CRUD ================================= */

function listOrders() { return readAll(SHEET_ORDERS).reverse(); }
function listBankSlips() { return readAll(SHEET_SLIPS).reverse(); }
function auditLog() { return readAll(SHEET_AUDIT).reverse(); }

function editOrder(admin, data) {
  return withLock(function () {
    const orderId = data.orderId;
    const idx = findRow(SHEET_ORDERS, 'OrderID', orderId);
    if (idx < 0) return { ok: false, error: 'Order not found.' };
    const order = readAll(SHEET_ORDERS).find(function (o) { return o.OrderID === orderId; });
    const name = String(data.name != null ? data.name : order.Name).trim();
    const gradeClass = String(data.gradeClass != null ? data.gradeClass : order.GradeClass).trim();
    const contact = String(data.contact != null ? data.contact : order.Contact).trim();
    const batch = String(data.batch != null ? data.batch : (order.Batch || '')).trim();
    const design = String(data.design != null ? data.design : order.Design).trim();
    const size = String(data.size != null ? data.size : order.Size).trim();
    const qty = Math.max(1, parseInt(data.quantity != null ? data.quantity : order.Qty, 10) || 1);

    if (!name || !design || !size) return { ok: false, error: 'Name, design and size are required.' };
    if (SHIRT_SIZES.indexOf(size) === -1) return { ok: false, error: 'Please select a valid shirt size.' };
    if (batch && BATCH_OPTIONS.indexOf(batch) === -1) return { ok: false, error: 'Please select a valid batch.' };

    const price = getPrice(design);
    const total = price * qty;
    setCell(SHEET_ORDERS, idx, 'Name', name);
    setCell(SHEET_ORDERS, idx, 'GradeClass', gradeClass);
    setCell(SHEET_ORDERS, idx, 'Contact', contact);
    setCell(SHEET_ORDERS, idx, 'Batch', batch);
    setCell(SHEET_ORDERS, idx, 'Design', design);
    setCell(SHEET_ORDERS, idx, 'Size', size);
    setCell(SHEET_ORDERS, idx, 'Qty', qty);
    setCell(SHEET_ORDERS, idx, 'Total', total);
    const pIdx = findRow(SHEET_PAYMENTS, 'OrderID', orderId);
    if (pIdx >= 0) setCell(SHEET_PAYMENTS, pIdx, 'Amount', total);
    audit(admin.Email, 'Order edited', orderId, '');
    bumpDataVersion();
    return { ok: true };
  });
}

function setOrderStatus(admin, orderId, status) {
  return withLock(function () {
    const idx = findRow(SHEET_ORDERS, 'OrderID', orderId);
    if (idx < 0) return { ok: false, error: 'Order not found.' };
    setCell(SHEET_ORDERS, idx, 'Status', status);
    audit(admin.Email, 'Order status → ' + status, orderId, '');
    bumpDataVersion();
    return { ok: true };
  });
}

function addOrderNote(admin, orderId, note) {
  return withLock(function () {
    const idx = findRow(SHEET_ORDERS, 'OrderID', orderId);
    if (idx < 0) return { ok: false, error: 'Order not found.' };
    const order = readAll(SHEET_ORDERS).find(function (o) { return o.OrderID === orderId; });
    const stamp = '[' + now() + ' · ' + (admin.Name || admin.Email) + '] ' + note;
    setCell(SHEET_ORDERS, idx, 'Note', order.Note ? order.Note + '\n' + stamp : stamp);
    audit(admin.Email, 'Note added', orderId, note);
    bumpDataVersion();
    return { ok: true };
  });
}

function deleteRows(name, col, value) {
  const c = colIndex(name, col);
  if (c < 0) return;
  const values = readSheetValues(name);
  const toDelete = [];
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][c]) === String(value)) toDelete.push(i + 1);
  }
  const sh = getSheet(name);
  for (let j = toDelete.length - 1; j >= 0; j--) sh.deleteRow(toDelete[j]);
}

function deleteOrder(admin, orderId) {
  return withLock(function () {
    const oIdx = findRow(SHEET_ORDERS, 'OrderID', orderId);
    if (oIdx < 0) return { ok: false, error: 'Order not found.' };
    const order = readAll(SHEET_ORDERS).find(function (o) { return o.OrderID === orderId; });

    readAll(SHEET_SLIPS).filter(function (s) { return s.OrderID === orderId; }).forEach(function (s) {
      if (s.DriveFileID) { try { DriveApp.getFileById(s.DriveFileID).setTrashed(true); } catch (e) {} }
    });
    deleteRows(SHEET_SLIPS, 'OrderID', orderId);
    deleteRows(SHEET_PAYMENTS, 'OrderID', orderId);

    audit(admin.Email, 'Order deleted', orderId, order ? order.Name : '');
    ensureSheet(SHEET_ORDERS, ORDERS_HEADER).deleteRow(oIdx + 1);
    bumpDataVersion();
    return { ok: true };
  });
}

/* ============================ BANK SLIPS ================================= */

function getBankSlipFile(slipId) {
  const slip = readAll(SHEET_SLIPS).find(function (s) { return s.SlipID === slipId; });
  if (!slip || !slip.DriveFileID) return { ok: false, error: 'Receipt not found.' };
  try {
    const blob = DriveApp.getFileById(slip.DriveFileID).getBlob();
    return { ok: true, name: slip.FileName, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
  } catch (e) {
    return { ok: false, error: 'Unable to load receipt file.' };
  }
}

function approvePayment(admin, orderId) {
  return withLock(function () {
    const idx = findRow(SHEET_ORDERS, 'OrderID', orderId);
    if (idx < 0) return { ok: false, error: 'Order not found.' };
    setCell(SHEET_ORDERS, idx, 'Status', 'Paid');
    const pIdx = findRow(SHEET_PAYMENTS, 'OrderID', orderId);
    if (pIdx >= 0) {
      setCell(SHEET_PAYMENTS, pIdx, 'Status', 'Paid');
      setCell(SHEET_PAYMENTS, pIdx, 'VerificationStatus', 'Verified');
      setCell(SHEET_PAYMENTS, pIdx, 'VerifiedBy', admin.Name || admin.Email);
      setCell(SHEET_PAYMENTS, pIdx, 'VerifiedAt', now());
    }
    readAll(SHEET_SLIPS).filter(function (s) { return s.OrderID === orderId && s.Status === 'Pending Review'; }).forEach(function (s) {
      const si = findRow(SHEET_SLIPS, 'SlipID', s.SlipID);
      if (si >= 0) {
        setCell(SHEET_SLIPS, si, 'Status', 'Approved');
        setCell(SHEET_SLIPS, si, 'ReviewedBy', admin.Name || admin.Email);
        setCell(SHEET_SLIPS, si, 'ReviewedAt', now());
      }
    });
    audit(admin.Email, 'Payment approved', orderId, '');
    bumpDataVersion();
    return { ok: true };
  });
}

function rejectPayment(admin, orderId, reason) {
  return withLock(function () {
    const idx = findRow(SHEET_ORDERS, 'OrderID', orderId);
    if (idx < 0) return { ok: false, error: 'Order not found.' };
    setCell(SHEET_ORDERS, idx, 'Status', 'Payment Rejected');
    const pIdx = findRow(SHEET_PAYMENTS, 'OrderID', orderId);
    if (pIdx >= 0) {
      setCell(SHEET_PAYMENTS, pIdx, 'VerificationStatus', 'Rejected');
      setCell(SHEET_PAYMENTS, pIdx, 'VerifiedBy', admin.Name || admin.Email);
      setCell(SHEET_PAYMENTS, pIdx, 'VerifiedAt', now());
    }
    readAll(SHEET_SLIPS).filter(function (s) { return s.OrderID === orderId; }).forEach(function (s) {
      const si = findRow(SHEET_SLIPS, 'SlipID', s.SlipID);
      if (si >= 0) {
        setCell(SHEET_SLIPS, si, 'Status', 'Rejected');
        setCell(SHEET_SLIPS, si, 'ReviewedBy', admin.Name || admin.Email);
        setCell(SHEET_SLIPS, si, 'ReviewedAt', now());
        setCell(SHEET_SLIPS, si, 'RejectionReason', reason || '');
      }
    });
    audit(admin.Email, 'Payment rejected', orderId, reason || '');
    bumpDataVersion();
    return { ok: true };
  });
}

function requestNewSlip(admin, orderId) {
  return withLock(function () {
    const idx = findRow(SHEET_ORDERS, 'OrderID', orderId);
    if (idx < 0) return { ok: false, error: 'Order not found.' };
    setCell(SHEET_ORDERS, idx, 'Status', 'Payment Pending');
    readAll(SHEET_SLIPS).filter(function (s) { return s.OrderID === orderId; }).forEach(function (s) {
      const si = findRow(SHEET_SLIPS, 'SlipID', s.SlipID);
      if (si >= 0) setCell(SHEET_SLIPS, si, 'Status', 'Resubmission Requested');
    });
    audit(admin.Email, 'Requested new slip', orderId, '');
    bumpDataVersion();
    return { ok: true };
  });
}

/* =========================== MANUAL ORDERS =============================== */

function addManualOrder(admin, d) {
  ensureSetup();
  const name = String(d.name || '').trim();
  const grade = String(d.grade || '').trim();
  const klass = String(d.class || '').trim();
  const gradeClass = [grade ? 'Grade ' + grade : '', klass].filter(Boolean).join(' ');
  const contact = String(d.contact || '').trim();
  const batch = String(d.batch || '').trim();
  const design = String(d.design || '').trim();
  const size = String(d.size || '').trim();
  const qty = Math.max(1, parseInt(d.quantity, 10) || 1);
  const method = String(d.method || 'Cash / Hand Payment').trim();
  const paid = d.paid === true || String(d.paidStatus) === 'Paid';
  const note = String(d.note || '').trim();
  const reference = String(d.reference || '').trim();

  if (!name || !batch || !design || !size) return { ok: false, error: 'Name, batch, design and size are required.' };
  if (BATCH_OPTIONS.indexOf(batch) === -1) return { ok: false, error: 'Please select a valid batch.' };
  if (SHIRT_SIZES.indexOf(size) === -1) return { ok: false, error: 'Please select a valid shirt size.' };

  return withLock(function () {
    const price = getPrice(design);
    const total = price * qty;
    const orderId = nextOrderNumber('Manual');
    const ts = now();
    const status = paid ? 'Manually Paid' : 'Payment Pending';
    appendRow(SHEET_ORDERS, [orderId, name, gradeClass, contact, batch, design, size, qty, price, total, 'Manual', status, note, ts]);
    appendRow(SHEET_PAYMENTS, [orderId, total, method, paid ? 'Paid' : 'Pending', paid ? 'Verified' : 'Unverified', d.paymentDate || '', d.paymentTime || '', admin.Name || admin.Email, paid ? ts : '', reference, '']);
    audit(admin.Email, 'Manual order added', orderId, name + ' · ' + design + ' ' + size + ' ×' + qty);
    bumpDataVersion();
    return { ok: true, orderId: orderId, total: total };
  });
}

/* ============================== REPORTS ================================== */

function reports(admin, type, from, to) {
  const orders = readAll(SHEET_ORDERS).filter(function (o) {
    if (!from && !to) return true;
    const d = String(o.CreatedAt).slice(0, 10);
    return (!from || d >= from) && (!to || d <= to);
  });
  const orderIds = orders.map(function (o) { return o.OrderID; });
  const payments = readAll(SHEET_PAYMENTS).filter(function (p) { return orderIds.indexOf(p.OrderID) >= 0; });
  const totalShirts = orders.reduce(function (s, o) { return s + (parseInt(o.Qty, 10) || 0); }, 0);
  const paidAmount = orders.filter(function (o) { return PAID_STATUSES.indexOf(o.Status) >= 0; })
    .reduce(function (s, o) { return s + (parseInt(o.Total, 10) || 0); }, 0);
  const pendingAmount = orders.filter(function (o) { return PAID_STATUSES.indexOf(o.Status) < 0 && o.Status !== 'Cancelled'; })
    .reduce(function (s, o) { return s + (parseInt(o.Total, 10) || 0); }, 0);
  audit(admin.Email, 'Report generated', '', type);
  return {
    ok: true, type: type, generatedAt: now(), generatedBy: admin.Name || admin.Email,
    totalOrders: orders.length, totalShirts: totalShirts, paidAmount: paidAmount, pendingAmount: pendingAmount,
    designStats: designStats(orders), sizeStats: sizeStats(orders), batchStats: batchStats(orders), orders: orders, payments: payments
  };
}

function productionSummary() {
  const orders = readAll(SHEET_ORDERS).filter(function (o) { return o.Status !== 'Cancelled'; });
  const result = { designs: {}, batches: {}, totalShirts: 0 };
  ['Design 01', 'Design 02'].forEach(function (d) {
    const ds = orders.filter(function (o) { return o.Design === d; });
    const sizes = {};
    SHIRT_SIZES.forEach(function (s) { sizes[s] = 0; });
    ds.forEach(function (o) {
      const key = normalizeSize(o.Size);
      if (sizes[key] !== undefined) sizes[key] += (parseInt(o.Qty, 10) || 0);
    });
    const total = SHIRT_SIZES.reduce(function (s, sz) { return s + sizes[sz]; }, 0);
    result.designs[d] = { sizes: sizes, total: total };
    result.totalShirts += total;
  });
  BATCH_OPTIONS.forEach(function (b) {
    const bs = orders.filter(function (o) { return normalizeBatch(o.Batch) === b; });
    const sizes = {};
    SHIRT_SIZES.forEach(function (s) { sizes[s] = 0; });
    bs.forEach(function (o) {
      const key = normalizeSize(o.Size);
      if (sizes[key] !== undefined) sizes[key] += (parseInt(o.Qty, 10) || 0);
    });
    const total = SHIRT_SIZES.reduce(function (s, sz) { return s + sizes[sz]; }, 0);
    result.batches[b] = { sizes: sizes, total: total };
  });
  return result;
}

function changePassword(admin, current, next) {
  if (!next || String(next).length < 6) return { ok: false, error: 'New password must be at least 6 characters.' };
  if (hashPassword(current, admin.Salt) !== admin.PasswordHash) return { ok: false, error: 'Current password is incorrect.' };
  const salt = Utilities.getUuid().slice(0, 12);
  const idx = findRow(SHEET_ADMINS, 'Email', admin.Email);
  setCell(SHEET_ADMINS, idx, 'Salt', salt);
  setCell(SHEET_ADMINS, idx, 'PasswordHash', hashPassword(next, salt));
  audit(admin.Email, 'Password changed', '', '');
  return { ok: true };
}

/* ============================== ENTRY ==================================== */

function doPost(e) {
  try {
    ensureSetup();
    const raw = (e && e.postData) ? e.postData.contents : '{}';
    const data = JSON.parse(raw);
    const action = data.action;

    if (action === 'login') return jsonResponse(login(data.username, data.password));
    if (action === 'submitOrder') return jsonResponse(submitOrder(data));

    const admin = authAdmin(data.token || '');
    if (!admin) return jsonResponse({ ok: false, error: 'Not authenticated.', auth: false });

    switch (action) {
      case 'logout': return jsonResponse({ ok: true });
      case 'dashboard': return jsonResponse(dashboard(admin));
      case 'listOrders': return jsonResponse({ ok: true, orders: listOrders() });
      case 'listBankSlips': return jsonResponse({ ok: true, slips: listBankSlips() });
      case 'getBankSlip': return jsonResponse(getBankSlipFile(data.slipId));
      case 'editOrder': return jsonResponse(editOrder(admin, data));
      case 'setStatus': return jsonResponse(setOrderStatus(admin, data.orderId, data.status));
      case 'addNote': return jsonResponse(addOrderNote(admin, data.orderId, data.note));
      case 'deleteOrder': return jsonResponse(deleteOrder(admin, data.orderId));
      case 'approvePayment': return jsonResponse(approvePayment(admin, data.orderId));
      case 'rejectPayment': return jsonResponse(rejectPayment(admin, data.orderId, data.reason));
      case 'requestNewSlip': return jsonResponse(requestNewSlip(admin, data.orderId));
      case 'addManualOrder': return jsonResponse(addManualOrder(admin, data));
      case 'productionSummary': return jsonResponse({ ok: true, summary: productionSummary() });
      case 'reports': return jsonResponse(reports(admin, data.reportType, data.from, data.to));
      case 'auditLog': return jsonResponse({ ok: true, log: auditLog() });
      case 'changePassword': return jsonResponse(changePassword(admin, data.current, data.next));
      case 'settings': return jsonResponse({ ok: true, prices: DESIGN_PRICES, version: BACKEND_VERSION });
      default: return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Server error.' });
  }
}

function doGet() {
  try { ensureSetup(); } catch (e) { /* ignore */ }
  const hasDelete = (typeof deleteOrder === 'function');
  const hasEdit = (typeof editOrder === 'function');
  const html =
    '<div style="font-family:system-ui,sans-serif;padding:40px;max-width:640px">' +
    '<h2 style="color:#211A70">Kegalu Vidyalaya Science Society — Shirt Drop backend</h2>' +
    '<p style="color:#68728F">This endpoint is for the website and admin dashboard only.</p>' +
    '<hr style="border:none;border-top:1px solid #e5e0d3;margin:20px 0">' +
    '<p><strong>Backend version:</strong> ' + BACKEND_VERSION + '</p>' +
    '<p><strong>Delete order handler:</strong> ' + (hasDelete ? '<span style="color:#1E9B68">AVAILABLE</span>' : '<span style="color:#C0392B">MISSING — stale deployment</span>') + '</p>' +
    '<p><strong>Edit order handler:</strong> ' + (hasEdit ? '<span style="color:#1E9B68">AVAILABLE</span>' : '<span style="color:#C0392B">MISSING — stale deployment</span>') + '</p>' +
    '<p style="color:#68728F;font-size:13px">If you still see "Unknown action" for delete/edit in the admin, redeploy this script as a <strong>New version</strong> (Deploy → Manage deployments → Edit → New version).</p>' +
    '</div>';
  return HtmlService.createHtmlOutput(html);
}

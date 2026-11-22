/**
 * utils.gs
 * ─────────────────────────────────────────────
 * Hàm tiện ích dùng chung – không gọi service nào của Google.
 * ─────────────────────────────────────────────
 */

/**
 * Bỏ dấu tiếng Việt, chuyển thường, gọn khoảng trắng.
 * Dùng để so sánh không phân biệt dấu.
 * @param {*} s
 * @returns {string}
 */
function fold_(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Làm sạch chuỗi nhập vào:
 *  - NFC, loại ký tự điều khiển, gọn khoảng trắng, cắt tối đa maxLen ký tự.
 * @param {*}      v
 * @param {number} maxLen
 * @returns {string}
 */
function clean_(v, maxLen) {
  return String(v == null ? '' : v)
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * JSON an toàn để nhúng vào thẻ <script> (chống XSS).
 * @param {*} o
 * @returns {string}
 */
function safeJson_(o) {
  return JSON.stringify(o)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Hash MD5 → Base64 URL-safe (dùng để ẩn khoá trong CacheService).
 * @param {string} s
 * @returns {string}
 */
function hash_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes);
}

/**
 * Trả về JSON response cho Web App.
 * @param {object} o
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function json_(o) {
  return ContentService
    .createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Chặn công thức (=, +, -, @) do người dùng nhập vào Sheet.
 * @param {*} v
 * @returns {*}
 */
function safeCell_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

/**
 * Chỉ cho phép chạy từ menu Sheet (chặn gọi từ trình duyệt).
 * @returns {GoogleAppsScript.Base.Ui}
 */
function requireSheetUi_() {
  try {
    return SpreadsheetApp.getUi();
  } catch (e) {
    throw new Error('Chức năng này chỉ chạy từ menu "🔗 QR Trường" trong Google Sheet.');
  }
}

/** Lấy Spreadsheet (ưu tiên property → fallback active). */
function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_SS_ID);
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error(
    'Chưa khởi tạo. Mở Google Sheet → menu "🔗 QR Trường" → "Khởi tạo / kiểm tra các tab".'
  );
  return ss;
}

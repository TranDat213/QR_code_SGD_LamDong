/**
 * validation.gs
 * ─────────────────────────────────────────────
 * Quy tắc kiểm tra dữ liệu đầu vào – phải trùng khớp
 * với validation.js phía client để tránh sai lệch.
 * ─────────────────────────────────────────────
 */

/** Regex cho phép tên người: chữ cái Unicode, dấu, khoảng trắng, chấm, nháy đơn, gạch nối */
const NAME_RE_ = /^[\p{L}\p{M}]+(?:[ .''\-]+[\p{L}\p{M}]+)*\.?$/u;

/**
 * Kiểm tra họ tên.
 * @param {string} n - Đã qua clean_()
 * @returns {string} Thông báo lỗi hoặc ''
 */
function checkName_(n) {
  if (!n)                           return 'Vui lòng nhập họ và tên.';
  if (n.length < 4 || n.length > 60)
                                    return 'Họ và tên phải từ 4 đến 60 ký tự.';
  if (/\d/.test(n))                 return 'Họ và tên không được chứa chữ số.';
  if (!NAME_RE_.test(n))            return 'Họ và tên chỉ được gồm chữ cái và khoảng trắng.';
  if (n.split(' ').length < 2)      return 'Vui lòng nhập đầy đủ họ và tên (ít nhất 2 từ).';
  return '';
}

/**
 * Chuẩn hoá số điện thoại:
 *  +84 / 84 → 0, bỏ khoảng trắng . - ( ), xử lý Sheet bỏ số 0 đầu.
 * @param {*} v
 * @returns {string}
 */
function normPhone_(v) {
  let s = String(v == null ? '' : v).replace(/[\s.\-()]/g, '');
  if (/^\+84\d+$/.test(s))       s = '0' + s.slice(3);
  else if (/^84\d{9}$/.test(s))  s = '0' + s.slice(2);
  else if (/^\d{9}$/.test(s) && s[0] !== '0') s = '0' + s; // Sheet làm mất số 0 đầu
  return s.slice(0, 20);
}

/**
 * Kiểm tra số điện thoại.
 * @param {string} p - Đã qua normPhone_()
 * @returns {string} Thông báo lỗi hoặc ''
 */
function checkPhone_(p) {
  if (!p)                   return 'Vui lòng nhập số điện thoại.';
  if (!/^\d+$/.test(p))     return 'Số điện thoại chỉ gồm chữ số.';
  if (!/^0\d{9}$/.test(p))  return 'Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0.';
  return '';
}

/**
 * Che bớt số điện thoại trước khi ghi log (bảo vệ quyền riêng tư).
 * Ví dụ: 0912345678 → 091****678
 * @param {string} p
 * @returns {string}
 */
function maskPhone_(p) {
  p = String(p || '');
  return p.length >= 7 ? p.slice(0, 3) + '****' + p.slice(-3) : p;
}

/**
 * Chuẩn hoá mã trường: "5" → "05".
 * @param {*} v
 * @returns {string}
 */
function normCode_(v) {
  const s = String(v == null ? '' : v).trim();
  return /^\d{1,3}$/.test(s) ? s.padStart(2, '0') : s;
}

/**
 * Kiểm tra URL hợp lệ (phải bắt đầu bằng https://).
 * @param {*} url
 * @returns {boolean}
 */
function isValidLink_(url) {
  return /^https:\/\/[^\s"'<>]+$/i.test(String(url || ''));
}

/**
 * Lấy folder ID từ link Google Drive.
 * Hỗ trợ cả dạng /folders/ID và dạng ?id=ID.
 * @param {string} url
 * @returns {string} folder ID hoặc ''
 */
function folderIdFromLink_(url) {
  if (!isValidLink_(url)) return '';
  const m = String(url).match(/\/folders\/([\w-]{10,})/) ||
            String(url).match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : '';
}

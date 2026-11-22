/**
 * validation.js
 * ─────────────────────────────────────────────
 * Quy tắc kiểm tra dữ liệu đầu vào – phải trùng khớp
 * với logic phía server (Code.gs) để tránh lỗi kép.
 * ─────────────────────────────────────────────
 */

/** Regex cho phép tên người: chữ cái Unicode, dấu, khoảng trắng, chấm, nháy đơn, gạch nối */
const NAME_RE = /^[\p{L}\p{M}]+(?:[ .''\-]+[\p{L}\p{M}]+)*\.?$/u;

/**
 * Chuẩn hoá chuỗi nhập vào:
 *  - NFC
 *  - Thay ký tự điều khiển bằng khoảng trắng
 *  - Gọn khoảng trắng
 * @param {*} s
 * @returns {string}
 */
export function norm(s) {
  return String(s || '')
    .normalize('NFC')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Kiểm tra họ tên.
 * @param {string} name - Đã qua norm()
 * @returns {string} Thông báo lỗi hoặc '' nếu hợp lệ
 */
export function checkName(name) {
  if (!name)                     return 'Vui lòng nhập họ và tên.';
  if (name.length < 4 || name.length > 60)
                                 return 'Họ và tên phải từ 4 đến 60 ký tự.';
  if (/\d/.test(name))           return 'Họ và tên không được chứa chữ số.';
  if (!NAME_RE.test(name))       return 'Họ và tên chỉ được gồm chữ cái và khoảng trắng.';
  if (name.split(' ').length < 2)return 'Vui lòng nhập đầy đủ họ và tên (ít nhất 2 từ).';
  return '';
}

/**
 * Chuẩn hoá số điện thoại:
 *  +84 / 84 → 0, bỏ khoảng trắng . - ( )
 * @param {*} v
 * @returns {string}
 */
export function normPhone(v) {
  let s = String(v || '').replace(/[\s.\-()]/g, '');
  if (/^\+84\d+$/.test(s))  s = '0' + s.slice(3);
  else if (/^84\d{9}$/.test(s)) s = '0' + s.slice(2);
  return s;
}

/**
 * Kiểm tra số điện thoại.
 * @param {string} phone - Đã qua normPhone()
 * @returns {string} Thông báo lỗi hoặc ''
 */
export function checkPhone(phone) {
  if (!phone)              return 'Vui lòng nhập số điện thoại.';
  if (!/^\d+$/.test(phone))return 'Số điện thoại chỉ gồm chữ số.';
  if (!/^0\d{9}$/.test(phone))
                           return 'Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0.';
  return '';
}

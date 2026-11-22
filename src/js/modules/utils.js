/**
 * utils.js
 * ─────────────────────────────────────────────
 * Hàm tiện ích dùng chung (không phụ thuộc DOM)
 * ─────────────────────────────────────────────
 */

/**
 * Bỏ dấu tiếng Việt, chuyển thường, gọn khoảng trắng.
 * Dùng để so sánh không phân biệt dấu khi tìm kiếm trường.
 * @param {*} s
 * @returns {string}
 */
export function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escape HTML: chống XSS khi nhúng chuỗi vào innerHTML.
 * @param {*} s
 * @returns {string}
 */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/**
 * Lấy hoặc tạo mới deviceId lưu trong localStorage.
 * Dùng để giới hạn số lần gửi form theo thiết bị.
 * @returns {string}
 */
export function deviceId() {
  try {
    const KEY = 'qr_dev';
    let v = localStorage.getItem(KEY);
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    return '';
  }
}

/**
 * Highlight từ khoá trong văn bản gốc (giữ dấu tiếng Việt),
 * so khớp theo chuỗi đã fold().
 * @param {string} text  - Văn bản gốc
 * @param {string} qf    - Từ khoá đã fold()
 * @returns {string}     - HTML có thẻ <mark>
 */
export function highlight(text, qf) {
  if (!qf) return esc(text);

  // Xây bản đồ: vị trí trong chuỗi fold → vị trí trong text gốc
  const map = [];
  let plain = '';
  for (let i = 0; i < text.length; i++) {
    const f = text[i] === ' ' ? ' ' : fold(text[i]);
    for (let j = 0; j < f.length; j++) {
      plain += f[j];
      map.push(i);
    }
  }

  const at = plain.indexOf(qf);
  if (at < 0) return esc(text);

  const s = map[at];
  const e = map[at + qf.length - 1] + 1;
  return esc(text.slice(0, s)) + '<mark>' + esc(text.slice(s, e)) + '</mark>' + esc(text.slice(e));
}

/**
 * Định dạng kích thước file thành chuỗi KB / MB.
 * @param {number} n - Số byte
 * @returns {string}
 */
export function fmtSize(n) {
  if (!n) return '';
  return n < 1_048_576
    ? Math.max(1, Math.round(n / 1024)) + ' KB'
    : (n / 1_048_576).toFixed(1) + ' MB';
}

/**
 * Trả về [cssClass, nhãn] tương ứng với MIME type của file.
 * @param {string} mime
 * @returns {[string, string]}
 */
export function fileIcon(mime) {
  if (/pdf/.test(mime))                          return ['pdf', 'PDF'];
  if (/sheet|excel|spreadsheet/.test(mime))      return ['xls', 'XLS'];
  if (/word|document/.test(mime))                return ['doc', 'DOC'];
  if (/presentation|powerpoint/.test(mime))      return ['ppt', 'PPT'];
  if (/^image\//.test(mime))                     return ['img', 'ẢNH'];
  return ['', 'FILE'];
}

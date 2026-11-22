/**
 * api.js
 * ─────────────────────────────────────────────
 * Lớp giao tiếp với Google Apps Script Web App
 * Tất cả fetch tới backend đều đi qua module này.
 * ─────────────────────────────────────────────
 */

/** URL endpoint Apps Script – deploy dưới dạng Web App */
const API_URL = 'https://script.google.com/macros/s/AKfycbzH7jTeYHhtDJCiGjEoCvJqWdOSqYltdBaUzQjPRaleqn16mPvBfhxvFoJks5tiXJld/exec';

/** Headers chung – dùng text/plain để tránh CORS preflight */
const HEADERS = { 'Content-Type': 'text/plain;charset=utf-8' };

/**
 * Tải danh sách trường công khai (không có link Drive).
 * Thử lại tối đa 2 lần nếu thất bại.
 * @param {number} [attempt=0]
 * @returns {Promise<{ ok: boolean, schools?: object[], config?: object, message?: string }>}
 */
export async function fetchSchools(attempt = 0) {
  try {
    const res = await fetch(`${API_URL}?api=schools`, { credentials: 'omit' });
    return await res.json();
  } catch {
    if (attempt < 2) {
      await delay(1500);
      return fetchSchools(attempt + 1);
    }
    throw new Error('Không tải được danh sách trường');
  }
}

/**
 * Gửi form xác thực đơn vị.
 * @param {object} payload
 * @param {string} payload.fullName
 * @param {string} payload.phone
 * @param {string} payload.schoolCode   - Chỉ gửi MÃ, không gửi link
 * @param {string} payload.website      - Honeypot (phải để trống)
 * @param {number} payload.elapsedMs    - Thời gian điền form (ms)
 * @param {string} payload.deviceId
 * @returns {Promise<object>}           - { status, ... }
 */
export async function submitForm(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    credentials: 'omit',
    headers: HEADERS,
    body: JSON.stringify(payload),
  });
  return res.json();
}

/**
 * Gọi API có phiên (action: 'list' | 'file').
 * Token được đính kèm tự động.
 * @param {object} body
 * @param {string} token - Session token nhận sau submitForm thành công
 * @returns {Promise<object>}
 */
export async function callSessionApi(body, token) {
  const res = await fetch(API_URL, {
    method: 'POST',
    credentials: 'omit',
    headers: HEADERS,
    body: JSON.stringify({ ...body, token }),
  });
  return res.json();
}

// ── Nội bộ ──────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

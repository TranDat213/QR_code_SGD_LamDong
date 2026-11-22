/**
 * app.js
 * ─────────────────────────────────────────────
 * Entry point – Điều phối toàn bộ luồng ứng dụng:
 *   1. Tải danh sách trường
 *   2. Khởi tạo combobox
 *   3. Lắng nghe submit form → gọi API → xử lý phản hồi
 *   4. Điều hướng qua lại form ↔ trình xem tài liệu
 * ─────────────────────────────────────────────
 */

import { fold }                               from './modules/utils.js';
import { norm, normPhone, checkName, checkPhone } from './modules/validation.js';
import { fetchSchools, submitForm }           from './modules/api.js';
import { initCombobox, loadSchools, getSelected } from './modules/combobox.js';
import { showDocumentViewer }                 from './modules/document-viewer.js';
import { deviceId }                           from './modules/utils.js';

// ── Khởi động ────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const openedAt = Date.now();
let busy = false;

/** Mã trường được truyền qua URL ?ma=XX */
const preselect = (new URLSearchParams(location.search).get('ma') || '').trim();

// Khởi tạo combobox ngay khi DOM sẵn sàng
const combo = initCombobox();

// ── Tải danh sách trường ─────────────────────────────────────────────────

$('comboText').innerHTML = '<span class="ph">Đang tải danh sách trường…</span>';

fetchSchools()
  .then((d) => {
    if (!d.ok) throw new Error(d.message || 'load');

    // Áp cấu hình từ server (tiêu đề, phụ đề, ghi chú riêng tư)
    applyServerConfig(d.config || {});

    loadSchools(d.schools || []);

    // Chọn sẵn trường nếu URL có ?ma=
    if (preselect) {
      const pre = (d.schools || []).find((s) => s.c === preselect);
      if (pre) combo.setSelected(pre);
    } else {
      combo.setSelected(null); // hiện placeholder
    }
  })
  .catch(() => {
    showBanner('error', 'Không tải được danh sách trường. Vui lòng kiểm tra mạng rồi tải lại trang.');
    $('comboText').innerHTML = '<span class="ph">Chưa tải được danh sách</span>';
  });

// ── Submit form ───────────────────────────────────────────────────────────

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (busy) return;

  hideBanner();
  if (!validate()) return;

  setBusy(true);

  submitForm({
    fullName:  $('fullName').value,
    phone:     $('phone').value,
    schoolCode: getSelected().c,       // chỉ gửi MÃ
    website:   $('website').value,     // honeypot
    elapsedMs: Date.now() - openedAt,
    deviceId:  deviceId(),
  })
    .then(onResponse)
    .catch(() => {
      setBusy(false);
      showBanner('error', 'Không kết nối được máy chủ. Dữ liệu bạn đã nhập vẫn được giữ, vui lòng bấm Gửi lại.');
    });
});

// ── Xử lý phản hồi ───────────────────────────────────────────────────────

function onResponse(r) {
  setBusy(false);
  r = r || {};

  switch (r.status) {
    case 'ok':
      $('form').hidden = true;
      showDocumentViewer(r, backToForm);
      break;

    case 'nolink':
      showNoLink(r);
      break;

    case 'denied':
      setErr('fullName', ' ');
      setErr('phone', ' ');
      showBanner('error', r.message);
      break;

    case 'invalid_input':
      Object.entries(r.errors || {}).forEach(([k, v]) => setErr(k, v));
      break;

    case 'invalid_school':
      if (r.schools) loadSchools(r.schools);
      combo.setSelected(null);
      setErr('schoolCode', 'Vui lòng chọn lại trường.');
      showBanner('error', r.message);
      break;

    default:
      showBanner('error', r.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
  }
}

// ── Màn hình "Thư mục chưa sẵn sàng" ────────────────────────────────────

function showNoLink(r) {
  $('form').hidden = true;
  const box = $('result');
  box.hidden = false;
  box.innerHTML =
    `<div class="msg warn"><h2>Thư mục chưa sẵn sàng</h2>${r.message}</div>` +
    `<p>Đơn vị: <span class="sn">${r.schoolName}</span> (${r.cluster})</p>` +
    `<button type="button" class="btn sec" id="backBtn">Quay lại biểu mẫu</button>`;
  $('backBtn').onclick = backToForm;
  window.scrollTo(0, 0);
}

// ── Điều hướng ───────────────────────────────────────────────────────────

function backToForm() {
  $('result').hidden = true;
  $('form').hidden = false;
  // Không reset form – người dùng không cần điền lại
}

// ── Validation form ───────────────────────────────────────────────────────

/** Regex & quy tắc tái sử dụng từ validation.js qua inline */
function validate() {
  clearErrs();
  let ok = true;

  const name = norm($('fullName').value);
  $('fullName').value = name;

  const phone = normPhone($('phone').value);
  $('phone').value = phone;

  const en = checkName(name);
  if (en) { setErr('fullName', en); ok = false; }

  const ep = checkPhone(phone);
  if (ep) { setErr('phone', ep); ok = false; }

  if (!getSelected()) { setErr('schoolCode', 'Vui lòng chọn trường từ danh sách.'); ok = false; }

  if (!ok) {
    const first = document.querySelector('.invalid');
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return ok;
}

// Realtime feedback khi blur / sửa
['fullName', 'phone'].forEach((id) => {
  $(id).addEventListener('blur', () => {
    const v = id === 'phone' ? normPhone($(id).value) : norm($(id).value);
    if (!v) return;
    setErr(id, id === 'fullName' ? checkName(v) : checkPhone(v));
  });
  $(id).addEventListener('input', () => {
    if ($(`e_${id}`).textContent) setErr(id, '');
  });
});

// ── Helpers UI ────────────────────────────────────────────────────────────

function applyServerConfig(cfg) {
  if (cfg.title)    { document.title = cfg.title; $('title').textContent = cfg.title; }
  if (cfg.subtitle) $('subtitle').textContent = cfg.subtitle;
  if (cfg.privacy)  $('privacy').textContent  = cfg.privacy;
}

function showBanner(type, text) {
  const b = $('banner');
  b.hidden = false;
  b.innerHTML = `<div class="msg ${type}" role="alert">${text}</div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideBanner() {
  const b = $('banner');
  b.hidden = true;
  b.innerHTML = '';
}

function setErr(field, text) {
  const e = $(`e_${field}`);
  if (e) e.textContent = text || '';
  const el = field === 'schoolCode' ? $('comboBtn') : $(field);
  if (el) el.classList.toggle('invalid', !!text);
}

function clearErrs() {
  ['fullName', 'phone', 'schoolCode'].forEach((f) => setErr(f, ''));
}

function setBusy(b) {
  busy = b;
  $('submitBtn').disabled = b;
  $('submitBtn').textContent = b ? 'Đang kiểm tra…' : 'Gửi và mở thư mục';
}

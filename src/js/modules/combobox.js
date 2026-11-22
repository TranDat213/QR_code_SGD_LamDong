/**
 * combobox.js
 * ─────────────────────────────────────────────
 * Combobox chọn trường có tìm kiếm không dấu
 *
 * Sử dụng:
 *   import { initCombobox } from './combobox.js';
 *   const combo = initCombobox();
 *   combo.loadSchools(schools);        // mảng { c, g, n, f? }
 *   const selected = combo.getSelected(); // null hoặc { c, g, n }
 * ─────────────────────────────────────────────
 */

import { fold, esc, highlight } from './utils.js';

/** @type {Array<{c:string, g:string, n:string, f:string}>} */
let SCHOOLS = [];
/** @type {object|null} */
let selected = null;
/** @type {Array<object>} */
let results = [];
let activeIdx = -1;

// ── Shorthand DOM ─────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

/**
 * Khởi tạo combobox và đăng ký event listener.
 * Gọi một lần sau DOMContentLoaded.
 * @returns {{ loadSchools, getSelected, setSelected }}
 */
export function initCombobox() {
  $('comboBtn').addEventListener('click', () => {
    $('panel').classList.contains('open') ? closePanel() : openPanel();
  });

  $('panelClose').addEventListener('click', closePanel);
  $('q').addEventListener('input', render);

  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown')   { e.preventDefault(); moveActive(1); }
    else if (e.key === 'ArrowUp')  { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const i = activeIdx >= 0 ? activeIdx : (results.length === 1 ? 0 : -1);
      if (i >= 0) { _setSelected(results[i]); closePanel(); }
    } else if (e.key === 'Escape') closePanel();
  });

  $('list').addEventListener('click', (e) => {
    const btn = e.target.closest('.opt');
    if (!btn) return;
    _setSelected(results[Number(btn.getAttribute('data-i'))]);
    closePanel();
    $('comboBtn').focus();
  });

  // Đóng khi click ra ngoài (desktop)
  document.addEventListener('click', (e) => {
    if (window.innerWidth >= 700 && !$('combo').contains(e.target)) closePanel();
  });

  return { loadSchools, getSelected, setSelected: _setSelected };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Nạp danh sách trường và tính sẵn trường fold.
 * @param {Array<{c:string, g:string, n:string}>} schools
 */
export function loadSchools(schools) {
  SCHOOLS = schools.map((s) => ({ ...s, f: fold(s.n + ' ' + s.c + ' ' + s.g) }));
}

/** @returns {object|null} Trường đang được chọn */
export function getSelected() {
  return selected;
}

// ── Nội bộ ────────────────────────────────────────────────────────────────

function _setSelected(s) {
  selected = s;
  if (s) {
    $('comboText').innerHTML =
      `<span class="val">${esc(s.n)}</span>` +
      `<span class="cl">${esc(s.g)} · Mã ${esc(s.c)}</span>`;
  } else {
    $('comboText').innerHTML = '<span class="ph">Bấm để chọn hoặc tìm trường…</span>';
  }
}

function openPanel() {
  $('panel').classList.add('open');
  if (window.innerWidth < 700) document.body.style.overflow = 'hidden';
  $('q').value = '';
  render();
  setTimeout(() => $('q').focus(), 50);
}

function closePanel() {
  $('panel').classList.remove('open');
  document.body.style.overflow = '';
}

function render() {
  const qf = fold($('q').value);
  const words = qf ? qf.split(' ') : [];

  results = SCHOOLS.filter((s) => words.every((w) => s.f.includes(w)));
  activeIdx = -1;

  $('count').textContent = `${results.length} / ${SCHOOLS.length} đơn vị`;

  if (!results.length) {
    $('list').innerHTML = '<div class="empty">Không tìm thấy trường phù hợp.<br>Hãy thử gõ ít từ hơn.</div>';
    return;
  }

  let html = '';
  let lastGroup = null;
  results.forEach((s, i) => {
    if (s.g !== lastGroup) {
      html += `<div class="grp">${esc(s.g)}</div>`;
      lastGroup = s.g;
    }
    const label = words.length === 1 ? words[0] : qf;
    html += `<button type="button" class="opt" role="option" data-i="${i}">` +
            `<span class="cd">${esc(s.c)}</span>${highlight(s.n, label)}</button>`;
  });
  $('list').innerHTML = html;
}

function moveActive(d) {
  const opts = $('list').querySelectorAll('.opt');
  if (!opts.length) return;
  if (activeIdx >= 0) opts[activeIdx].classList.remove('act');
  activeIdx = (activeIdx + d + opts.length) % opts.length;
  opts[activeIdx].classList.add('act');
  opts[activeIdx].scrollIntoView({ block: 'nearest' });
}

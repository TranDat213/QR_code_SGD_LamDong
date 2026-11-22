/**
 * document-viewer.js
 * ─────────────────────────────────────────────
 * Trình xem tài liệu Drive qua phiên tạm (session token)
 *
 * Luồng:
 *   showOk(r)  → hiện khu vực tài liệu → openFolder(null)
 *               → người dùng bấm thư mục → openFolder(id)
 *               → người dùng bấm Xem    → loadFile(id)
 *               → hiện nút Mở / Tải về (Blob URL)
 * ─────────────────────────────────────────────
 */

import { esc, fmtSize, fileIcon } from './utils.js';
import { callSessionApi } from './api.js';

// ── Trạng thái phiên ────────────────────────────────────────────────────
/** @type {{ token:string, school:string, cluster:string, until:number, path:Array } | null} */
let SESS = null;
let timerId = null;
/** Danh sách Blob URL cần thu hồi khi logout */
const objUrls = [];

const $ = (id) => document.getElementById(id);

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Khởi tạo màn hình xem tài liệu sau khi đăng nhập thành công.
 * @param {object} r - Response từ submitForm { token, schoolName, cluster, expiresIn }
 * @param {Function} onLogout - Callback khi người dùng thoát / hết phiên
 */
export function showDocumentViewer(r, onLogout) {
  SESS = {
    token: r.token,
    school: r.schoolName,
    cluster: r.cluster,
    until: Date.now() + (r.expiresIn || 1800) * 1000,
    path: [],
    onLogout,
  };

  const box = $('result');
  box.hidden = false;
  box.className = 'card docs';
  box.innerHTML =
    `<div class="docs-head">` +
    `  <div><h2>${esc(r.schoolName)}</h2><span class="cl">${esc(r.cluster)}</span></div>` +
    `  <span class="timer" id="timer"></span>` +
    `</div>` +
    `<div class="crumbs" id="crumbs"></div>` +
    `<div id="items"></div>` +
    `<p class="note">Bấm "Mở" để xem, "Tải về" để lưu tài liệu vào máy.</p>` +
    `<button type="button" class="btn sec" id="backBtn">Thoát</button>`;

  $('backBtn').onclick = () => logout(onLogout);

  // Bắt đầu đồng hồ đếm ngược
  timerId = setInterval(tick, 1000);
  tick();

  window.scrollTo(0, 0);
  openFolder(null, 'Thư mục của trường');
}

// ── Thư mục ───────────────────────────────────────────────────────────────

function openFolder(id, name) {
  if (!SESS) return;

  $('items').innerHTML = '<p class="note">Đang tải…</p>';

  callSessionApi({ action: 'list', folderId: id || '' }, SESS.token)
    .then((d) => {
      if (!SESS) return;
      if (d.status === 'expired') { expired(d.message); return; }
      if (d.status !== 'ok') {
        $('items').innerHTML = `<div class="msg error">${esc(d.message || 'Không mở được thư mục.')}</div>`;
        return;
      }

      SESS.path.push({ id: d.folderId, name: d.isRoot ? 'Thư mục của trường' : (name || d.folderName) });
      if (d.expiresIn) SESS.until = Date.now() + d.expiresIn * 1000;

      renderCrumbs();
      renderItems(d.folders, d.files);
    })
    .catch(() => {
      $('items').innerHTML = '<div class="msg error">Không kết nối được máy chủ. Vui lòng thử lại.</div>';
    });
}

function renderItems(folders, files) {
  let html = '';

  folders.forEach((f) => {
    html += `<div class="item">` +
            `<span class="ic fd">📁</span>` +
            `<button type="button" class="fold" data-f="${esc(f.id)}">${esc(f.name)}</button>` +
            `</div>`;
  });

  files.forEach((f) => {
    const [cls, label] = fileIcon(f.mime);
    const meta = [fmtSize(f.size), f.updated].filter(Boolean).join(' · ');
    html += `<div class="item">` +
            `<span class="ic ${cls}">${label}</span>` +
            `<span class="nm">${esc(f.name)}<span class="meta">${esc(meta)}</span></span>` +
            `<span class="act" id="a_${esc(f.id)}">` +
            `  <button type="button" data-file="${esc(f.id)}">Xem</button>` +
            `</span></div>`;
  });

  $('items').innerHTML = html || '<p class="note">Thư mục này chưa có tài liệu.</p>';

  // Sự kiện cho thư mục
  $('items').querySelectorAll('[data-f]').forEach((btn) => {
    btn.onclick = () => openFolder(btn.getAttribute('data-f'), btn.textContent);
  });

  // Sự kiện cho file
  $('items').querySelectorAll('[data-file]').forEach((btn) => {
    btn.onclick = () => loadFile(btn.getAttribute('data-file'), btn);
  });
}

// ── File ──────────────────────────────────────────────────────────────────

function loadFile(id, btn) {
  btn.disabled = true;
  btn.textContent = 'Đang tải…';

  callSessionApi({ action: 'file', fileId: id }, SESS.token)
    .then((d) => {
      if (d.status === 'expired') { expired(d.message); return; }

      const slot = document.getElementById(`a_${id}`);
      if (d.status !== 'ok') {
        btn.disabled = false;
        btn.textContent = 'Xem';
        showErrorBanner(d.message || 'Không mở được file.');
        return;
      }

      // Giải mã Base64 → Blob URL
      const bin = atob(d.data);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: d.mime || 'application/octet-stream' }));
      objUrls.push(url);

      slot.innerHTML =
        `<a class="pri" href="${url}" target="_blank" rel="noopener">Mở</a>` +
        `<a href="${url}" download="${esc(d.name)}">Tải về</a>`;
    })
    .catch(() => {
      btn.disabled = false;
      btn.textContent = 'Xem';
      showErrorBanner('Không kết nối được máy chủ. Vui lòng thử lại.');
    });
}

// ── Breadcrumb ────────────────────────────────────────────────────────────

function renderCrumbs() {
  const c = $('crumbs');
  if (!c) return;
  c.innerHTML = SESS.path
    .map((p, i) =>
      i === SESS.path.length - 1
        ? `<b>${esc(p.name)}</b>`
        : `<button type="button" data-k="${i}">${esc(p.name)}</button>`,
    )
    .join(' › ');

  c.querySelectorAll('button').forEach((btn) => {
    btn.onclick = () => {
      const k = Number(btn.getAttribute('data-k'));
      const p = SESS.path[k];
      SESS.path = SESS.path.slice(0, k);
      openFolder(p.id, p.name);
    };
  });
}

// ── Phiên & đồng hồ ──────────────────────────────────────────────────────

function tick() {
  if (!SESS) return;
  const s = Math.max(0, Math.round((SESS.until - Date.now()) / 1000));
  const t = $('timer');
  if (t) t.textContent = `Còn ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (s <= 0) expired();
}

function expired(msg) {
  clearInterval(timerId);
  const onLogout = SESS?.onLogout;
  SESS = null;

  const box = $('result');
  box.className = 'card res';
  box.innerHTML =
    `<div class="msg warn">${esc(msg || 'Phiên xem tài liệu đã hết hạn. Vui lòng điền lại biểu mẫu.')}</div>` +
    `<button type="button" class="btn" id="backBtn">Quay lại biểu mẫu</button>`;
  $('backBtn').onclick = () => onLogout && onLogout();
}

function logout(onLogout) {
  clearInterval(timerId);
  SESS = null;
  objUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* bỏ qua */ } });
  objUrls.length = 0;

  $('result').className = 'card res';
  onLogout && onLogout();
}

function showErrorBanner(msg) {
  const b = document.getElementById('banner');
  if (!b) return;
  b.hidden = false;
  b.innerHTML = `<div class="msg error" role="alert">${esc(msg)}</div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

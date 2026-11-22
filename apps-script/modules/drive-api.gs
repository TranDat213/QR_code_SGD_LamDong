/**
 * drive-api.gs
 * ─────────────────────────────────────────────
 * API liệt kê thư mục và tải file Google Drive qua phiên tạm.
 *
 * Bảo mật:
 *   - Mỗi file/thư mục chỉ truy cập được nếu ID của nó đã xuất hiện
 *     trong lần liệt kê bắt đầu từ thư mục gốc (allowlist trong session).
 *   - File shortcut bị loại (có thể trỏ ra ngoài thư mục trường).
 *   - File > MAX_FILE_BYTES bị từ chối.
 * ─────────────────────────────────────────────
 */

/**
 * POST { action:'list', token, folderId? }
 * → Danh sách thư mục con + file trong thư mục (chỉ trong phiên của trường).
 *
 * @param {object} p
 * @returns {object}
 */
function apiList_(p) {
  const token = String(p.token || '');
  const lock  = LockService.getScriptLock();
  lock.tryLock(5000);

  try {
    const sess = loadSession_(token);
    if (!sess) return EXPIRED_;

    const fid = String(p.folderId || sess.root);

    // Chỉ cho phép truy cập ID đã được liệt kê trước đó
    if (!/^[\w-]{10,}$/.test(fid) || !sess.allow.includes(fid)) return FORBIDDEN_;

    const folder  = DriveApp.getFolderById(fid);
    const folders = [];
    const files   = [];

    // Lấy tối đa 300 thư mục con
    const fi = folder.getFolders();
    while (fi.hasNext() && folders.length < 300) {
      const f = fi.next();
      if (f.isTrashed()) continue;
      folders.push({ id: f.getId(), name: f.getName() });
    }

    // Lấy tối đa 500 file (bỏ shortcut)
    const it = folder.getFiles();
    while (it.hasNext() && files.length < 500) {
      const f    = it.next();
      const mime = f.getMimeType();
      if (f.isTrashed() || mime === 'application/vnd.google-apps.shortcut') continue;
      files.push({
        id:      f.getId(),
        name:    f.getName(),
        mime,
        size:    f.getSize(),
        updated: Utilities.formatDate(f.getLastUpdated(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy'),
      });
    }

    // Sắp xếp theo tên (hỗ trợ số tự nhiên tiếng Việt)
    const byName = (a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true });
    folders.sort(byName);
    files.sort(byName);

    // Thêm vào allowlist để client có thể truy cập lần sau
    [...folders, ...files].forEach((x) => {
      if (!sess.allow.includes(x.id)) sess.allow.push(x.id);
    });
    saveSession_(token, sess);

    return {
      status:     'ok',
      folderId:   fid,
      isRoot:     fid === sess.root,
      folderName: folder.getName(),
      folders,
      files,
      expiresIn:  Math.floor((sess.exp - Date.now()) / 1000),
    };

  } finally {
    try { lock.releaseLock(); } catch (e) { /* bỏ qua */ }
  }
}

/**
 * POST { action:'file', token, fileId }
 * → Nội dung file (base64). Google Docs/Sheets/Slides xuất ra PDF tự động.
 *
 * @param {object} p
 * @returns {object}
 */
function apiFile_(p) {
  const sess = loadSession_(p.token);
  if (!sess) return EXPIRED_;

  const id = String(p.fileId || '');
  if (!/^[\w-]{10,}$/.test(id) || !sess.allow.includes(id)) return FORBIDDEN_;

  const f    = DriveApp.getFileById(id);
  const mime = f.getMimeType();
  let   blob, name = f.getName();

  // Google Docs/Sheets/Slides → xuất ra PDF
  if (/^application\/vnd\.google-apps\./.test(mime)) {
    blob = f.getAs('application/pdf');
    if (!/\.pdf$/i.test(name)) name += '.pdf';
  } else {
    if (f.getSize() > CONFIG.MAX_FILE_BYTES) {
      return { status: 'too_big', message: `File quá lớn để mở qua trang web (trên 25MB). Vui lòng liên hệ ${CONFIG.ORG_CONTACT}.` };
    }
    blob = f.getBlob();
  }

  const bytes = blob.getBytes();
  if (bytes.length > CONFIG.MAX_FILE_BYTES) {
    return { status: 'too_big', message: `File quá lớn để mở qua trang web (trên 25MB). Vui lòng liên hệ ${CONFIG.ORG_CONTACT}.` };
  }

  return {
    status: 'ok',
    name,
    mime: blob.getContentType() || mime,
    data: Utilities.base64Encode(bytes),
  };
}

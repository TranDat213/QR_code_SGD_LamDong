/**
 * teacher-auth.gs
 * ─────────────────────────────────────────────
 * Xác thực giáo viên & quản lý phiên xem tài liệu.
 *
 * Nguyên tắc bảo mật:
 *   - Người dùng KHÔNG bao giờ nhận link Drive trực tiếp.
 *   - Phải khớp (họ tên + SĐT) với tab DanhSachGiaoVien của đúng trường.
 *   - Sau khi xác thực → nhận token phiên (SESSION_SECONDS giây).
 *   - Mỗi thư mục/file chỉ truy cập được nếu đã được liệt kê từ thư mục
 *     gốc của trường (allowlist) → không thể đoán ID để xem trường khác.
 * ─────────────────────────────────────────────
 */

const TEACHER_CACHE_KEY = 'teachers_v1';

// ── Danh sách giáo viên ───────────────────────────────────────────────────

/**
 * Xây dựng index giáo viên dạng:
 *   { "mã_trường|sdt": ["ho ten da fold", ...] }
 * Chỉ lấy giáo viên có Trạng thái = "Hoạt động" (hoặc để trống).
 * @returns {object}
 */
function getTeacherIndex_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(TEACHER_CACHE_KEY);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* đọc lại */ } }

  const sh = getSpreadsheet_().getSheetByName(CONFIG.SHEET_TEACHERS);
  const idx = {};

  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues().forEach((r) => {
      const code  = normCode_(r[0]);
      const phone = normPhone_(r[2]);
      const st    = fold_(r[3]);

      // Bỏ qua: thiếu mã, thiếu SĐT, hoặc trạng thái != Hoạt động (nếu có ghi)
      if (!code || !phone || (st && st !== fold_(CONFIG.STATUS_ACTIVE))) return;

      const k = code + '|' + phone;
      (idx[k] = idx[k] || []).push(fold_(r[1]));
    });
  }

  try { cache.put(TEACHER_CACHE_KEY, JSON.stringify(idx), CONFIG.CACHE_SECONDS); }
  catch (e) { console.warn('Không ghi được cache giáo viên:', e); }

  return idx;
}

/**
 * Kiểm tra xem (họ tên + SĐT) có trong danh sách của trường không.
 * @param {string} code  - Mã trường (đã chuẩn hoá)
 * @param {string} name  - Họ tên (chưa fold)
 * @param {string} phone - SĐT (đã chuẩn hoá)
 * @returns {boolean}
 */
function isTeacherOf_(code, name, phone) {
  const names = getTeacherIndex_()[normCode_(code) + '|' + phone];
  return !!names && names.includes(fold_(name));
}

// ── Phiên xem tài liệu ───────────────────────────────────────────────────

/**
 * Tạo phiên mới và lưu vào CacheService.
 * @param {{ code, root, name, phone }} info
 * @returns {string} Token (64 ký tự hex)
 */
function createSession_(info) {
  const token = Utilities.getUuid().replace(/-/g, '') +
                Utilities.getUuid().replace(/-/g, '');
  const sess = {
    code:  info.code,
    root:  info.root,
    name:  info.name,
    phone: info.phone,
    exp:   Date.now() + CONFIG.SESSION_SECONDS * 1000,
    allow: [info.root],   // allowlist: chỉ ID đã được liệt kê
  };
  CacheService.getScriptCache().put(
    'ss_' + token, JSON.stringify(sess), CONFIG.SESSION_SECONDS
  );
  return token;
}

/**
 * Tải phiên; trả null nếu token không hợp lệ hoặc đã hết hạn.
 * @param {string} token
 * @returns {object|null}
 */
function loadSession_(token) {
  token = String(token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;

  const raw = CacheService.getScriptCache().get('ss_' + token);
  if (!raw) return null;

  try {
    const s = JSON.parse(raw);
    return s.exp > Date.now() ? s : null;
  } catch (e) { return null; }
}

/**
 * Cập nhật phiên: gia hạn thời gian + lưu lại allowlist.
 * @param {string} token
 * @param {object} sess
 */
function saveSession_(token, sess) {
  sess.exp = Date.now() + CONFIG.SESSION_SECONDS * 1000;
  if (sess.allow.length > 3000) sess.allow = sess.allow.slice(-3000);
  CacheService.getScriptCache().put(
    'ss_' + token, JSON.stringify(sess), CONFIG.SESSION_SECONDS
  );
}

/** Phản hồi chuẩn khi phiên hết hạn. */
const EXPIRED_   = { status: 'expired',    message: 'Phiên xem tài liệu đã hết hạn do lâu không sử dụng. Vui lòng điền lại biểu mẫu.' };
/** Phản hồi chuẩn khi truy cập bị từ chối. */
const FORBIDDEN_ = { status: 'forbidden',  message: 'Bạn không có quyền xem mục này.' };

/**
 * school-data.gs
 * ─────────────────────────────────────────────
 * Đọc và cache danh sách trường từ Google Sheet.
 *
 * Nguyên tắc bảo mật:
 *   getSchools_()       → đầy đủ (có link), CHỈ dùng phía server.
 *   getPublicSchools_() → chỉ trường Hoạt động, KHÔNG có link, an toàn gửi xuống client.
 * ─────────────────────────────────────────────
 */

/**
 * Danh sách đầy đủ (có link Drive) – chỉ dùng server-side.
 * Kết quả được cache 5 phút (CONFIG.CACHE_SECONDS).
 * @returns {Array<{code, cluster, name, link, active, statusText, row}>}
 */
function getSchools_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CONFIG.CACHE_KEY);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* cache lỗi → đọc lại từ Sheet */ }
  }

  const list = readSchoolsFromSheet_();

  try {
    cache.put(CONFIG.CACHE_KEY, JSON.stringify(list), CONFIG.CACHE_SECONDS);
  } catch (e) {
    console.warn('Không ghi được cache danh sách trường:', e);
  }

  return list;
}

/**
 * Danh sách gửi xuống trình duyệt: chỉ trường Hoạt động, KHÔNG có link.
 * @returns {Array<{c:string, g:string, n:string}>}
 */
function getPublicSchools_() {
  return getSchools_()
    .filter((s) => s.active)
    .map((s) => ({ c: s.code, g: s.cluster, n: s.name }));
}

/**
 * Đọc dữ liệu thô từ tab DanhSachTruong.
 * - Bỏ qua dòng trống.
 * - Nếu Mã trùng: chỉ lấy dòng đầu tiên.
 * @returns {Array<object>}
 */
function readSchoolsFromSheet_() {
  const sh = getSpreadsheet_().getSheetByName(CONFIG.SHEET_SCHOOLS);
  if (!sh) throw new Error('Không tìm thấy tab ' + CONFIG.SHEET_SCHOOLS);

  const last = sh.getLastRow();
  if (last < 2) return [];

  // getDisplayValues để giữ nguyên mã dạng "01" (không bị chuyển thành số 1)
  const rows = sh.getRange(2, 1, last - 1, 5).getDisplayValues();
  const seen = {};
  const out = [];

  rows.forEach((r, i) => {
    const code = String(r[0]).trim();
    if (!code || seen[code]) return;
    seen[code] = true;
    out.push({
      code,
      cluster:    String(r[1]).trim(),
      name:       String(r[2]).replace(/\s+/g, ' ').trim(),
      link:       String(r[3]).trim(),
      active:     fold_(r[4]) === fold_(CONFIG.STATUS_ACTIVE),
      statusText: String(r[4]).trim(),
      row:        i + 2,
    });
  });

  return out;
}

/**
 * Làm mới cache ngay lập tức (gọi sau khi edit tab DanhSachTruong).
 */
function invalidateSchoolCache_() {
  CacheService.getScriptCache().remove(CONFIG.CACHE_KEY);
}

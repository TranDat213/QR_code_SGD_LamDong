/**
 * =====================================================================
 *  ĐỒNG BỘ DANH SÁCH TRƯỜNG TỪ GOOGLE DRIVE
 *  (file bổ sung cho Code.gs – dán vào cùng project Apps Script)
 * =====================================================================
 *  Cấu trúc Drive được đọc:
 *    Thư mục gốc (DRIVE_ROOT_FOLDER_ID)
 *      ├─ "Cụm 1 - ..."  →  "01 - PT DTNT Cư Jút", "02 - THPT ...", ...
 *      ├─ "Cụm 2 - ..."  →  "16 - ...", ...
 *      └─ ...
 *  Mỗi thư mục con "NN - Tên" = 1 trường: Mã = NN, Cụm = "Cụm X", Link = link thư mục.
 *
 *  Chạy từ menu "🔗 QR Trường" → "Đồng bộ danh sách trường từ Google Drive".
 *  - Trường đã có trong tab DanhSachTruong: cập nhật Link + Cụm (giữ Tên và Trạng thái bạn đã sửa).
 *  - Trường mới: thêm dòng, Trạng thái = Hoạt động.
 *  - Trường có trong Sheet nhưng không thấy trên Drive: KHÔNG xoá, chỉ báo lại.
 *  - Báo các thư mục chưa chia sẻ "Bất kỳ ai có đường liên kết" (thầy cô sẽ không mở được).
 * =====================================================================
 */

const DRIVE_ROOT_FOLDER_ID = '1O4TCsI_zx-w7ZB5rH-7gG2DsCQskPgKN'; // thư mục "Dot_1" (đổi 20/11/2026 sau khi tắt chia sẻ công khai)

function syncSchoolsFromDrive() {
  const ui = requireSheetUi_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty(PROP_SS_ID, ss.getId());
  const sh = ensureSheet_(ss, CONFIG.SHEET_SCHOOLS, SCHOOL_HEADERS);
  sh.getRange('A:A').setNumberFormat('@');

  // 1. Đọc Drive
  const root = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const found = [];          // {code, cluster, name, link, shared}
  const clusters = root.getFolders();
  while (clusters.hasNext()) {
    const cf = clusters.next();
    const cm = cf.getName().match(/^\s*c[uụ]m\s*(\d+)/i);
    if (!cm) continue;                     // bỏ qua thư mục không phải "Cụm N"
    const cluster = 'Cụm ' + Number(cm[1]);
    const schools = cf.getFolders();
    while (schools.hasNext()) {
      const f = schools.next();
      const m = f.getName().match(/^\s*(\d{1,3})\s*[-–.]\s*(.+?)\s*$/);
      if (!m) continue;
      let shared = true;
      try {
        const a = f.getSharingAccess();
        shared = (a === DriveApp.Access.ANYONE_WITH_LINK || a === DriveApp.Access.ANYONE);
      } catch (e) { /* không đọc được quyền thì bỏ qua */ }
      found.push({
        code: String(Number(m[1])).padStart(2, '0'),
        cluster: cluster,
        name: m[2].replace(/\s+/g, ' '),
        link: f.getUrl(),
        shared: shared,
      });
    }
  }
  found.sort(function (a, b) { return Number(a.code) - Number(b.code); });

  // 2. Đọc Sheet hiện tại
  const last = sh.getLastRow();
  const rows = last >= 2 ? sh.getRange(2, 1, last - 1, 5).getDisplayValues() : [];
  const rowByCode = {};
  rows.forEach(function (r, i) {
    const c = String(r[0]).trim();
    if (c && !rowByCode[c]) rowByCode[c] = i + 2;
  });

  // 3. Ghi
  let updated = 0, added = 0;
  const dupes = {}, appendRows = [];
  found.forEach(function (s) {
    if (dupes[s.code]) return;
    dupes[s.code] = true;
    const rowNo = rowByCode[s.code];
    if (rowNo) {
      const cur = rows[rowNo - 2];
      sh.getRange(rowNo, 2).setValue(s.cluster);
      if (!String(cur[2]).trim()) sh.getRange(rowNo, 3).setValue(s.name);
      if (String(cur[3]).trim() !== s.link) sh.getRange(rowNo, 4).setValue(s.link);
      if (!String(cur[4]).trim()) sh.getRange(rowNo, 5).setValue(CONFIG.STATUS_ACTIVE);
      updated++;
    } else {
      appendRows.push([s.code, s.cluster, s.name, s.link, CONFIG.STATUS_ACTIVE]);
      added++;
    }
  });
  if (appendRows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appendRows.length, 5).setValues(appendRows);
  }
  CacheService.getScriptCache().remove(CONFIG.CACHE_KEY);

  // 4. Báo cáo
  const driveCodes = {};
  found.forEach(function (s) { driveCodes[s.code] = true; });
  const missing = Object.keys(rowByCode).filter(function (c) { return !driveCodes[c]; });
  const notShared = found.filter(function (s) { return !s.shared; });

  let msg = 'Tìm thấy ' + found.length + ' thư mục trường trên Drive.\n' +
    'Cập nhật: ' + updated + ' dòng | Thêm mới: ' + added + ' dòng.';
  if (missing.length) {
    msg += '\n\nCó trong Sheet nhưng KHÔNG thấy thư mục trên Drive (giữ nguyên, hãy kiểm tra): ' + missing.join(', ');
  }
  if (notShared.length) {
    msg += '\n\n⚠ ' + notShared.length + ' thư mục CHƯA chia sẻ "Bất kỳ ai có đường liên kết" – thầy cô sẽ phải xin quyền mới mở được:\n' +
      notShared.slice(0, 30).map(function (s) { return s.code + ' - ' + s.name; }).join('\n') +
      (notShared.length > 30 ? '\n…' : '') +
      '\n\nCách nhanh: chia sẻ thư mục gốc (hoặc từng thư mục Cụm) ở chế độ "Bất kỳ ai có đường liên kết – Người xem", các thư mục con sẽ kế thừa.';
  }
  ui.alert('Đồng bộ từ Google Drive', msg, ui.ButtonSet.OK);
}

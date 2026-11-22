/**
 * sheet-setup.gs
 * ─────────────────────────────────────────────
 * Menu, khởi tạo tab, nhật ký, thống kê.
 * ─────────────────────────────────────────────
 */

// ── Menu ──────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔗 QR Trường')
    .addItem('1. Khởi tạo / kiểm tra các tab',                    'setup')
    .addItem('2. Đồng bộ danh sách trường từ Google Drive',        'syncSchoolsFromDrive')
    .addItem('Làm mới danh sách (xoá cache)',                       'refreshSchoolCache')
    .addItem('Kiểm tra danh sách trường',                          'validateSchoolList')
    .addItem('Kiểm tra danh sách giáo viên',                       'validateTeacherList')
    .addSeparator()
    .addItem('Cập nhật thống kê',                                  'refreshStats')
    .addItem('Bật tự động cập nhật thống kê (10 phút/lần)',        'installStatsTrigger')
    .addToUi();
}

/** Xoá cache khi sửa tab DanhSachTruong hoặc DanhSachGiaoVien trực tiếp trên Sheet. */
function onEdit(e) {
  try {
    const name = e && e.range && e.range.getSheet().getName();
    if (name === CONFIG.SHEET_SCHOOLS)  invalidateSchoolCache_();
    if (name === CONFIG.SHEET_TEACHERS) CacheService.getScriptCache().remove(TEACHER_CACHE_KEY);
  } catch { /* bỏ qua */ }
}

// ── Khởi tạo ─────────────────────────────────────────────────────────────

function setup() {
  const ui = requireSheetUi_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty(PROP_SS_ID, ss.getId());

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([CONFIG.STATUS_ACTIVE, CONFIG.STATUS_HIDDEN], true)
    .setAllowInvalid(false)
    .build();

  // Tab danh sách trường
  const shSchool = ensureSheet_(ss, CONFIG.SHEET_SCHOOLS, SCHOOL_HEADERS);
  shSchool.getRange('A:A').setNumberFormat('@');
  shSchool.getRange(2, 5, Math.max(shSchool.getMaxRows() - 1, 1), 1).setDataValidation(statusRule);
  shSchool.setColumnWidth(1, 60).setColumnWidth(2, 90).setColumnWidth(3, 380).setColumnWidth(4, 360).setColumnWidth(5, 110);

  // Tab nhật ký
  const shLog = ensureSheet_(ss, CONFIG.SHEET_LOG, LOG_HEADERS);
  shLog.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm:ss');
  shLog.getRange('C:D').setNumberFormat('@');
  shLog.setColumnWidth(1, 150).setColumnWidth(2, 180).setColumnWidth(3, 160).setColumnWidth(5, 320).setColumnWidth(7, 300).setColumnWidth(9, 220);

  // Tab danh sách giáo viên
  const shTeacher = ensureSheet_(ss, CONFIG.SHEET_TEACHERS, TEACHER_HEADERS);
  shTeacher.getRange('A:A').setNumberFormat('@');
  shTeacher.getRange('C:C').setNumberFormat('@');
  shTeacher.getRange(2, 4, Math.max(shTeacher.getMaxRows() - 1, 1), 1).setDataValidation(statusRule);
  shTeacher.setColumnWidth(1, 90).setColumnWidth(2, 220).setColumnWidth(3, 140).setColumnWidth(4, 110).setColumnWidth(5, 240);

  // Tab thống kê
  if (!ss.getSheetByName(CONFIG.SHEET_STATS)) ss.insertSheet(CONFIG.SHEET_STATS);

  invalidateSchoolCache_();
  refreshStats();

  ui.alert('Đã khởi tạo xong',
    `Các tab "${CONFIG.SHEET_SCHOOLS}", "${CONFIG.SHEET_LOG}", "${CONFIG.SHEET_STATS}" đã sẵn sàng.\n\n` +
    `Bước tiếp theo: dán danh sách trường vào tab ${CONFIG.SHEET_SCHOOLS} (từ dòng 2), ` +
    `cột E chọn "${CONFIG.STATUS_ACTIVE}" hoặc "${CONFIG.STATUS_HIDDEN}".`,
    ui.ButtonSet.OK);
}

/**
 * Đảm bảo tab tồn tại với tiêu đề đúng.
 * Nếu dòng 1 đang là dữ liệu → chèn dòng tiêu đề lên trên.
 */
function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  const first  = sh.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const isEmpty  = first.join('').trim() === '';
  const isHeader = fold_(first[0]) === fold_(headers[0]);

  if (!isEmpty && !isHeader) sh.insertRowBefore(1);
  sh.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#1a56db')
    .setFontColor('#ffffff');
  sh.setFrozenRows(1);
  return sh;
}

// ── Nhật ký ───────────────────────────────────────────────────────────────

/**
 * Ghi một dòng vào tab NhatKy.
 * @param {Array} values - Mảng giá trị theo thứ tự cột LOG_HEADERS
 */
function writeLog_(values) {
  const sh = getSpreadsheet_().getSheetByName(CONFIG.SHEET_LOG);
  if (!sh) throw new Error('Không tìm thấy tab ' + CONFIG.SHEET_LOG);

  const row = values.map(safeCell_);
  row[3] = values[3] ? "'" + String(values[3]) : ''; // giữ mã dạng chữ
  sh.appendRow(row);
}

// ── Cache ─────────────────────────────────────────────────────────────────

function refreshSchoolCache() {
  requireSheetUi_();
  invalidateSchoolCache_();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Web đã dùng danh sách mới nhất ngay từ lượt truy cập tiếp theo.',
    'Đã làm mới danh sách', 5
  );
}

// ── Kiểm tra dữ liệu ─────────────────────────────────────────────────────

function validateSchoolList() {
  const ui   = requireSheetUi_();
  const sh   = getSpreadsheet_().getSheetByName(CONFIG.SHEET_SCHOOLS);
  const last = sh.getLastRow();
  if (last < 2) { ui.alert('Tab ' + CONFIG.SHEET_SCHOOLS + ' chưa có dữ liệu.'); return; }

  const rows   = sh.getRange(2, 1, last - 1, 5).getDisplayValues();
  const seen   = {};
  const issues = [];
  let active = 0, hidden = 0, noLink = 0;

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const code  = String(r[0]).trim();
    if (!code && !String(r[2]).trim()) return;
    if (!code) { issues.push(`Dòng ${rowNo}: thiếu Mã.`); return; }
    if (seen[code]) issues.push(`Dòng ${rowNo}: Mã "${code}" trùng với dòng ${seen[code]}.`);
    else seen[code] = rowNo;
    if (!String(r[1]).trim()) issues.push(`Dòng ${rowNo}: thiếu Cụm.`);
    if (!String(r[2]).trim()) issues.push(`Dòng ${rowNo}: thiếu Tên đơn vị.`);
    const st = fold_(r[4]);
    if (st === fold_(CONFIG.STATUS_ACTIVE))      active++;
    else if (st === fold_(CONFIG.STATUS_HIDDEN)) hidden++;
    else issues.push(`Dòng ${rowNo}: Trạng thái "${r[4]}" không hợp lệ.`);
    const link = String(r[3]).trim();
    if (!link) noLink++;
    else if (!isValidLink_(link)) issues.push(`Dòng ${rowNo}: link không hợp lệ.`);
  });

  ui.alert('Kiểm tra danh sách trường',
    `Hoạt động: ${active} | Ẩn: ${hidden} | Chưa có link: ${noLink}\n\n` +
    (issues.length ? issues.slice(0, 40).join('\n') + (issues.length > 40 ? '\n…' : '') : 'Không phát hiện lỗi.'),
    ui.ButtonSet.OK);
}

function validateTeacherList() {
  const ui = requireSheetUi_();
  const ss = getSpreadsheet_();
  const sh = ensureSheet_(ss, CONFIG.SHEET_TEACHERS, TEACHER_HEADERS);
  CacheService.getScriptCache().remove(TEACHER_CACHE_KEY);

  const last = sh.getLastRow();
  if (last < 2) { ui.alert(`Tab ${CONFIG.SHEET_TEACHERS} chưa có dữ liệu.\nCột: ${TEACHER_HEADERS.join(' | ')}`); return; }

  const codes = {};
  readSchoolsFromSheet_().forEach((s) => { codes[s.code] = s; });

  const issues = [], seen = {}, perSchool = {};
  let ok = 0;

  sh.getRange(2, 1, last - 1, 4).getDisplayValues().forEach((r, i) => {
    const row   = i + 2;
    if (!r.join('').trim()) return;
    const code  = normCode_(r[0]);
    const phone = normPhone_(r[2]);
    const name  = clean_(r[1], 100);

    if (!codes[code]) { issues.push(`Dòng ${row}: mã trường "${r[0]}" không có trong ${CONFIG.SHEET_SCHOOLS}.`); return; }
    const en = checkName_(name);  if (en) { issues.push(`Dòng ${row}: ${en}`); return; }
    const ep = checkPhone_(phone); if (ep) { issues.push(`Dòng ${row}: ${ep} ("${r[2]}")`); return; }

    const st = fold_(r[3]);
    if (st && st !== fold_(CONFIG.STATUS_ACTIVE) && st !== fold_(CONFIG.STATUS_HIDDEN))
      issues.push(`Dòng ${row}: Trạng thái "${r[3]}" không hợp lệ.`);

    const k = code + '|' + phone + '|' + fold_(name);
    if (seen[k]) issues.push(`Dòng ${row}: trùng với dòng ${seen[k]}.`);
    else seen[k] = row;

    perSchool[code] = (perSchool[code] || 0) + 1;
    ok++;
  });

  const none = Object.keys(codes).filter((c) => codes[c].active && !perSchool[c]);
  ui.alert('Kiểm tra danh sách giáo viên',
    `Hợp lệ: ${ok} giáo viên ở ${Object.keys(perSchool).length} trường.\n` +
    (none.length ? `Trường chưa có giáo viên nào (không ai vào được): ${none.join(', ')}\n` : '') +
    '\n' + (issues.length ? issues.slice(0, 40).join('\n') + (issues.length > 40 ? '\n…' : '') : 'Không phát hiện lỗi.'),
    ui.ButtonSet.OK);
}

// ── Thống kê ──────────────────────────────────────────────────────────────

function refreshStats() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch { /* chạy từ trigger */ }
  buildStats_();
  if (ui) SpreadsheetApp.getActiveSpreadsheet().toast('Đã cập nhật tab ' + CONFIG.SHEET_STATS + '.', 'Thống kê', 4);
}

/** Dành cho time-based trigger (không cần UI). */
function autoRefreshStats(e) {
  if (!e || !e.triggerUid) return;
  buildStats_();
}

function installStatsTrigger() {
  const ui = requireSheetUi_();
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === 'autoRefreshStats') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoRefreshStats').timeBased().everyMinutes(10).create();
  ui.alert('Đã bật: tab ' + CONFIG.SHEET_STATS + ' sẽ tự cập nhật mỗi 10 phút.');
}

function buildStats_() {
  const ss      = getSpreadsheet_();
  const schools = readSchoolsFromSheet_();
  const logSh   = ss.getSheetByName(CONFIG.SHEET_LOG);
  const logRows = (logSh && logSh.getLastRow() > 1)
    ? logSh.getRange(2, 4, logSh.getLastRow() - 1, 5).getDisplayValues()
    : [];

  const blank = () => ({ total: 0, ok: 0, nolink: 0, err: 0 });
  const inc   = (o, st) => {
    o.total++;
    if (st === LOG_STATUS.OK)     o.ok++;
    else if (st === LOG_STATUS.NOLINK) o.nolink++;
    else                          o.err++;
  };

  const bySchool = {}, byCluster = {}, clusterOrder = [], extraCodes = [];
  const known = {};

  schools.forEach((s) => {
    if (byCluster[s.cluster] === undefined) { byCluster[s.cluster] = blank(); clusterOrder.push(s.cluster); }
    known[s.code] = s;
  });

  logRows.forEach((r) => {
    const code    = String(r[0]).trim() || '(không rõ)';
    const cluster = String(r[2]).trim() || (known[code] ? known[code].cluster : '(không rõ)');
    const st      = String(r[4]).trim();
    if (!bySchool[code]) { bySchool[code] = blank(); if (!known[code]) extraCodes.push({ code, name: String(r[1]).trim(), cluster }); }
    if (byCluster[cluster] === undefined) { byCluster[cluster] = blank(); clusterOrder.push(cluster); }
    inc(bySchool[code], st);
    inc(byCluster[cluster], st);
  });

  let sh = ss.getSheetByName(CONFIG.SHEET_STATS);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_STATS);
  sh.clear();

  const tz  = ss.getSpreadsheetTimeZone();
  const out = [];
  out.push(['THỐNG KÊ LƯỢT TRUY CẬP (lượt gửi form)', '', '', '', '', '', '', '']);
  out.push(['Cập nhật lúc: ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm:ss'), '', '', '', '', '', '', '']);
  out.push(['', '', '', '', '', '', '', '']);
  const clusterTitleRow = out.length + 1;
  out.push(['THEO CỤM', '', '', '', '', '', '', '']);
  out.push(['Cụm', 'Tổng lượt', 'Thành công', 'Chưa có link', 'Lỗi', '', '', '']);
  const tot = blank();
  clusterOrder.forEach((c) => {
    const o = byCluster[c];
    out.push([c, o.total, o.ok, o.nolink, o.err, '', '', '']);
    tot.total += o.total; tot.ok += o.ok; tot.nolink += o.nolink; tot.err += o.err;
  });
  out.push(['TỔNG CỘNG', tot.total, tot.ok, tot.nolink, tot.err, '', '', '']);
  const clusterTotalRow = out.length;
  out.push(['', '', '', '', '', '', '', '']);
  const schoolTitleRow = out.length + 1;
  out.push(['THEO TRƯỜNG', '', '', '', '', '', '', '']);
  out.push(['Mã', 'Cụm', 'Tên đơn vị', 'Trạng thái', 'Tổng lượt', 'Thành công', 'Chưa có link', 'Lỗi']);
  const schoolHeaderRow = out.length;
  schools.forEach((s) => {
    const o = bySchool[s.code] || blank();
    out.push(["'" + s.code, s.cluster, s.name, s.statusText, o.total, o.ok, o.nolink, o.err]);
  });
  extraCodes.forEach((x) => {
    const o = bySchool[x.code];
    out.push(["'" + x.code, x.cluster, x.name || '(không có trong danh sách)', '—', o.total, o.ok, o.nolink, o.err]);
  });

  sh.getRange(1, 1, out.length, 8).setValues(out);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1).setFontStyle('italic').setFontColor('#666666');
  [clusterTitleRow, schoolTitleRow].forEach((r) => sh.getRange(r, 1).setFontWeight('bold').setFontColor('#1a56db'));
  sh.getRange(clusterTitleRow + 1, 1, 1, 5).setFontWeight('bold').setBackground('#e8eefc');
  sh.getRange(clusterTotalRow,     1, 1, 5).setFontWeight('bold');
  sh.getRange(schoolHeaderRow,     1, 1, 8).setFontWeight('bold').setBackground('#e8eefc');
  sh.setColumnWidth(1, 110).setColumnWidth(3, 360);
  sh.setFrozenRows(0);
}

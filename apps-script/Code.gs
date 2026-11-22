/**
 * =====================================================================
 *  WEB APP: QUÉT QR → ĐIỀN FORM → MỞ THƯ MỤC DRIVE CỦA TRƯỜNG
 *  Google Apps Script (gắn với Google Sheet - container-bound)
 * =====================================================================
 *  Các tab trong Sheet:
 *    - DanhSachTruong : A Mã | B Cụm | C Tên đơn vị | D Link thư mục Drive | E Trạng thái
 *    - DanhSachGiaoVien: A Mã trường | B Họ và tên | C Số điện thoại | D Trạng thái | E Ghi chú
 *    - NhatKy         : nhật ký mỗi lượt gửi form
 *    - ThongKe        : thống kê theo cụm / theo trường (script tự ghi)
 *
 *  Menu trong Sheet: "🔗 QR Trường"
 * =====================================================================
 */

/* ---------------------- CẤU HÌNH (sửa tại đây) ---------------------- */
const CONFIG = {
  // Tiêu đề hiển thị trên trang web
  EVENT_TITLE: 'Hồ sơ thiết bị các đơn vị',
  EVENT_SUBTITLE: 'Điền thông tin bên dưới để mở thư mục biên bản danh mục thiết bị, hợp đồng và tài liệu của đơn vị.',

  // Thông tin liên hệ ban tổ chức (hiện khi trường chưa có link)
  ORG_CONTACT: 'Ban tổ chức (Sở GD&ĐT) tại sự kiện',

  // Trang form chính (Netlify). Link Apps Script cũ sẽ chỉ hiện nút dẫn sang trang này.
  FORM_PAGE_URL: 'https://heartfelt-brioche-d58fc5.netlify.app/',

  // Thông báo mục đích sử dụng thông tin cá nhân (hiện cuối form)
  PRIVACY_NOTE:
    'Thông tin bạn cung cấp (họ tên, số điện thoại, đơn vị) chỉ được Ban tổ chức dùng để ghi nhận ' +
    'đại diện đơn vị truy cập hồ sơ tại sự kiện và lập thống kê. Thông tin không được chia sẻ cho bên thứ ba ' +
    'và sẽ được xoá sau khi kết thúc công tác bàn giao. Bấm "Gửi" nghĩa là bạn đồng ý với mục đích này.',

  // Tên các tab
  SHEET_SCHOOLS: 'DanhSachTruong',
  SHEET_LOG: 'NhatKy',
  SHEET_STATS: 'ThongKe',
  SHEET_TEACHERS: 'DanhSachGiaoVien',

  // Phân quyền: phiên xem tài liệu (giây) và dung lượng file tối đa trả qua web
  SESSION_SECONDS: 21600,         // 6 giờ không dùng mới hết phiên (tối đa của CacheService)
  MAX_FILE_BYTES: 25 * 1024 * 1024,
  RATE_MAX_FAIL_PER_DEVICE: 5,    // nhập sai tối đa 5 lần / thiết bị / 10 phút
  RATE_MAX_FAIL_PER_SCHOOL: 20,   // nhập sai tối đa 20 lần / trường / 10 phút

  // Giá trị cột Trạng thái
  STATUS_ACTIVE: 'Hoạt động',
  STATUS_HIDDEN: 'Ẩn',

  // Cache danh sách trường (giây) - tối đa 5 phút
  CACHE_KEY: 'schools_v1',
  CACHE_SECONDS: 300,

  // Chống spam
  RATE_WINDOW_SECONDS: 600,  // cửa sổ 10 phút
  RATE_MAX_PER_DEVICE: 5,    // tối đa 5 lượt / thiết bị / 10 phút
  RATE_MAX_PER_NAME: 5,      // tối đa 5 lượt / cùng họ tên / 10 phút
  MIN_FILL_MS: 3000,         // gửi nhanh hơn 3 giây sau khi mở trang => nghi bot

  // Giới hạn tuổi
  AGE_MIN: 18,
  AGE_MAX: 80,
};

const SCHOOL_HEADERS = ['Mã', 'Cụm', 'Tên đơn vị', 'Link thư mục Drive', 'Trạng thái'];
const TEACHER_HEADERS = ['Mã trường', 'Họ và tên', 'Số điện thoại', 'Trạng thái', 'Ghi chú'];
const LOG_HEADERS = ['Thời gian', 'Họ tên', 'Số điện thoại', 'Mã trường', 'Tên trường', 'Cụm',
  'Link đã chuyển tới', 'Trạng thái', 'Ghi chú'];
const LOG_STATUS = { OK: 'Thành công', NOLINK: 'Chưa có link', ERR: 'Lỗi', DENIED: 'Không khớp' };
const PROP_SS_ID = 'SPREADSHEET_ID';

/* =====================================================================
 *  1. WEB APP
 * ===================================================================== */

/** API JSON cho trang form đặt ngoài script.google.com (tránh lỗi điện thoại đăng nhập nhiều tài khoản Google). */
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { p = {}; }
  try {
    if (p.action === 'list') return json_(apiList_(p));
    if (p.action === 'file') return json_(apiFile_(p));
  } catch (err) {
    console.error(err);
    return json_({ status: 'error', message: 'Hệ thống đang bận. Vui lòng thử lại sau giây lát.' });
  }
  return json_(submitForm(p));
}

function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'schools') {
    try {
      return json_({ ok: true, schools: getPublicSchools_(), config: {
        title: CONFIG.EVENT_TITLE, subtitle: CONFIG.EVENT_SUBTITLE, privacy: CONFIG.PRIVACY_NOTE,
        contact: CONFIG.ORG_CONTACT, ageMin: CONFIG.AGE_MIN, ageMax: CONFIG.AGE_MAX } });
    } catch (err) {
      console.error(err);
      return json_({ ok: false, message: 'Không tải được danh sách trường. Vui lòng tải lại trang hoặc liên hệ ' + CONFIG.ORG_CONTACT });
    }
  }
  if (CONFIG.FORM_PAGE_URL) {
    return HtmlService.createHtmlOutput(
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<div style="font:17px system-ui,sans-serif;max-width:520px;margin:40px auto;padding:16px;text-align:center">' +
      '<p>Trang hồ sơ đã chuyển sang địa chỉ mới.</p>' +
      '<p><a target="_top" style="display:inline-block;padding:14px 22px;background:#1a56db;color:#fff;border-radius:10px;text-decoration:none;font-weight:700" href="' +
      CONFIG.FORM_PAGE_URL + '">Mở trang hồ sơ</a></p></div>').setTitle(CONFIG.EVENT_TITLE);
  }
  const t = HtmlService.createTemplateFromFile('index');
  let schools = [];
  let loadError = '';
  try {
    schools = getPublicSchools_();
  } catch (err) {
    console.error(err);
    loadError = 'Không tải được danh sách trường. Vui lòng tải lại trang hoặc liên hệ ban tổ chức: ' + CONFIG.ORG_CONTACT;
  }
  const pre = (e && e.parameter && e.parameter.ma) ? String(e.parameter.ma).trim().slice(0, 20) : '';

  t.schoolsJson = safeJson_(schools);
  t.configJson = safeJson_({
    title: CONFIG.EVENT_TITLE,
    subtitle: CONFIG.EVENT_SUBTITLE,
    privacy: CONFIG.PRIVACY_NOTE,
    contact: CONFIG.ORG_CONTACT,
    ageMin: CONFIG.AGE_MIN,
    ageMax: CONFIG.AGE_MAX,
    preselect: pre,
    loadError: loadError,
  });

  return t.evaluate()
    .setTitle(CONFIG.EVENT_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Client gọi để tải lại danh sách (chỉ Mã, Cụm, Tên - KHÔNG có link). */
function getSchoolList() {
  return getPublicSchools_();
}

/**
 * Client gọi khi bấm Gửi.
 * Chỉ nhận MÃ trường; link được tra lại từ Sheet phía server.
 */
function submitForm(p) {
  p = p || {};
  const now = new Date();

  // --- Chống spam: honeypot + thời gian điền form ---
  if (clean_(p.website, 200) !== '') {
    return { status: 'error', message: 'Không thể gửi biểu mẫu. Vui lòng tải lại trang và thử lại.' };
  }
  if ((Number(p.elapsedMs) || 0) < CONFIG.MIN_FILL_MS) {
    return { status: 'error', message: 'Bạn bấm gửi quá nhanh. Vui lòng kiểm tra lại thông tin rồi bấm "Gửi" lần nữa.' };
  }

  // --- Kiểm tra dữ liệu ---
  const name = clean_(p.fullName, 100);
  const phone = normPhone_(p.phone);
  const code = clean_(p.schoolCode, 20);
  const device = clean_(p.deviceId, 64);

  const errors = {};
  const en = checkName_(name); if (en) errors.fullName = en;
  const ep = checkPhone_(phone); if (ep) errors.phone = ep;
  if (!/^\d{1,3}$/.test(code)) errors.schoolCode = 'Vui lòng chọn trường từ danh sách.';
  if (Object.keys(errors).length) return { status: 'invalid_input', errors: errors };

  // --- Giới hạn số lần gửi ---
  const keys = [{ key: 'n_' + fold_(name), max: CONFIG.RATE_MAX_PER_NAME },
    { key: 'p_' + phone, max: CONFIG.RATE_MAX_PER_NAME }];
  if (device) keys.push({ key: 'd_' + device, max: CONFIG.RATE_MAX_PER_DEVICE });
  const failKeys = [{ key: 'fs_' + code, max: CONFIG.RATE_MAX_FAIL_PER_SCHOOL }];
  if (device) failKeys.push({ key: 'fd_' + device, max: CONFIG.RATE_MAX_FAIL_PER_DEVICE });
  if (!peekRateLimit_(failKeys) || !checkRateLimit_(keys)) {
    return {
      status: 'error',
      message: 'Bạn đã gửi quá nhiều lần trong thời gian ngắn. Vui lòng thử lại sau ít phút ' +
        'hoặc liên hệ ban tổ chức: ' + CONFIG.ORG_CONTACT,
    };
  }

  try {
    const school = getSchools_().find(function (s) { return s.code === code; });

    // Mã không tồn tại hoặc trường đã bị ẩn
    if (!school || !school.active) {
      writeLog_([now, name, maskPhone_(phone), code,
        school ? school.name : '', school ? school.cluster : '', '',
        LOG_STATUS.ERR, school ? 'Trường đang ở trạng thái Ẩn' : 'Mã trường không hợp lệ']);
      return {
        status: 'invalid_school',
        message: 'Trường bạn chọn hiện không có trong danh sách. Danh sách đã được tải lại, vui lòng chọn lại trường.',
        schools: getPublicSchools_(),
      };
    }

    // Họ tên + số điện thoại phải có trong danh sách giáo viên CỦA ĐÚNG TRƯỜNG
    if (!isTeacherOf_(code, name, phone)) {
      checkRateLimit_(failKeys);
      writeLog_([now, name, maskPhone_(phone), code, school.name, school.cluster, '',
        LOG_STATUS.DENIED, 'Không khớp danh sách giáo viên']);
      return {
        status: 'denied',
        message: 'Họ tên hoặc số điện thoại không khớp với danh sách giáo viên của trường đã chọn. ' +
          'Vui lòng kiểm tra lại, hoặc liên hệ ' + CONFIG.ORG_CONTACT + ' để được bổ sung.',
      };
    }

    // Trường chưa có link (hoặc link sai định dạng)
    const rootId = folderIdFromLink_(school.link);
    if (!rootId) {
      writeLog_([now, name, maskPhone_(phone), code, school.name, school.cluster, '',
        LOG_STATUS.NOLINK, school.link ? 'Link sai định dạng: ' + school.link.slice(0, 100) : '']);
      return {
        status: 'nolink',
        schoolName: school.name,
        cluster: school.cluster,
        message: 'Thư mục của trường đang được cập nhật, vui lòng liên hệ ban tổ chức ' + CONFIG.ORG_CONTACT + '.',
      };
    }

    // Thành công
    writeLog_([now, name, maskPhone_(phone), code, school.name, school.cluster, school.link, LOG_STATUS.OK, '']);
    const token = createSession_({ code: code, root: rootId, name: name, phone: maskPhone_(phone) });
    return { status: 'ok', token: token, rootId: rootId, schoolName: school.name, cluster: school.cluster,
      expiresIn: CONFIG.SESSION_SECONDS };

  } catch (err) {
    console.error(err);
    try {
      writeLog_([now, name, maskPhone_(phone), code, '', '', '', LOG_STATUS.ERR, 'Lỗi hệ thống: ' + String(err).slice(0, 200)]);
    } catch (e2) { console.error(e2); }
    return { status: 'error', message: 'Hệ thống đang bận. Vui lòng thử lại sau giây lát.' };
  }
}

/* =====================================================================
 *  2. DỮ LIỆU DANH SÁCH TRƯỜNG (+ cache 5 phút)
 * ===================================================================== */

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_SS_ID);
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Chưa khởi tạo. Mở Google Sheet → menu "🔗 QR Trường" → "Khởi tạo / kiểm tra các tab".');
  return ss;
}

/** Danh sách đầy đủ (có link) - CHỈ dùng phía server. */
function getSchools_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CONFIG.CACHE_KEY);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* đọc lại từ Sheet */ }
  }
  const list = readSchoolsFromSheet_();
  try { cache.put(CONFIG.CACHE_KEY, JSON.stringify(list), CONFIG.CACHE_SECONDS); } catch (e) { console.warn(e); }
  return list;
}

/** Danh sách gửi xuống trình duyệt: chỉ trường Hoạt động, KHÔNG có link. */
function getPublicSchools_() {
  return getSchools_()
    .filter(function (s) { return s.active; })
    .map(function (s) { return { c: s.code, g: s.cluster, n: s.name }; });
}

function readSchoolsFromSheet_() {
  const sh = getSpreadsheet_().getSheetByName(CONFIG.SHEET_SCHOOLS);
  if (!sh) throw new Error('Không tìm thấy tab ' + CONFIG.SHEET_SCHOOLS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  // getDisplayValues để giữ nguyên mã dạng "01"
  const rows = sh.getRange(2, 1, last - 1, 5).getDisplayValues();
  const seen = {};
  const out = [];
  rows.forEach(function (r, i) {
    const code = String(r[0]).trim();
    if (!code || seen[code]) return; // bỏ dòng trống; mã trùng: lấy dòng đầu tiên
    seen[code] = true;
    out.push({
      code: code,
      cluster: String(r[1]).trim(),
      name: String(r[2]).replace(/\s+/g, ' ').trim(),
      link: String(r[3]).trim(),
      active: fold_(r[4]) === fold_(CONFIG.STATUS_ACTIVE),
      statusText: String(r[4]).trim(),
      row: i + 2,
    });
  });
  return out;
}

function isValidLink_(url) {
  return /^https:\/\/[^\s"'<>]+$/i.test(String(url || ''));
}

/* =====================================================================
 *  3. NHẬT KÝ + CHỐNG SPAM
 * ===================================================================== */

function writeLog_(values) {
  const sh = getSpreadsheet_().getSheetByName(CONFIG.SHEET_LOG);
  if (!sh) throw new Error('Không tìm thấy tab ' + CONFIG.SHEET_LOG);
  const row = values.map(safeCell_);
  row[3] = values[3] ? "'" + String(values[3]) : ''; // giữ mã dạng chữ (vd "01")
  sh.appendRow(row);
}

/** Chặn công thức (=, +, -, @) do người dùng nhập vào Sheet. */
function safeCell_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

/** Trả về false nếu bất kỳ khoá nào đã vượt giới hạn; ngược lại tăng bộ đếm. */
function checkRateLimit_(items) {
  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  const locked = lock.tryLock(3000);
  try {
    const hashed = items.map(function (it) { return { k: 'rl_' + hash_(it.key), max: it.max }; });
    const cur = cache.getAll(hashed.map(function (h) { return h.k; }));
    for (let i = 0; i < hashed.length; i++) {
      if ((Number(cur[hashed[i].k]) || 0) >= hashed[i].max) return false;
    }
    const upd = {};
    hashed.forEach(function (h) { upd[h.k] = String((Number(cur[h.k]) || 0) + 1); });
    cache.putAll(upd, CONFIG.RATE_WINDOW_SECONDS);
    return true;
  } finally {
    if (locked) lock.releaseLock();
  }
}

/** Chỉ kiểm tra (không tăng bộ đếm): false nếu đã vượt giới hạn. */
function peekRateLimit_(items) {
  const cache = CacheService.getScriptCache();
  const hashed = items.map(function (it) { return { k: 'rl_' + hash_(it.key), max: it.max }; });
  const cur = cache.getAll(hashed.map(function (h) { return h.k; }));
  return hashed.every(function (h) { return (Number(cur[h.k]) || 0) < h.max; });
}

/* =====================================================================
 *  4. MENU TRONG GOOGLE SHEET
 * ===================================================================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔗 QR Trường')
    .addItem('1. Khởi tạo / kiểm tra các tab', 'setup')
    .addItem('2. Đồng bộ danh sách trường từ Google Drive', 'syncSchoolsFromDrive')
    .addItem('Làm mới danh sách (xoá cache)', 'refreshSchoolCache')
    .addItem('Kiểm tra danh sách trường', 'validateSchoolList')
    .addItem('Kiểm tra danh sách giáo viên', 'validateTeacherList')
    .addSeparator()
    .addItem('Cập nhật thống kê', 'refreshStats')
    .addItem('Bật tự động cập nhật thống kê (10 phút/lần)', 'installStatsTrigger')
    .addToUi();
}

/** Sửa tab DanhSachTruong trên giao diện → xoá cache ngay. */
function onEdit(e) {
  try {
    const n = e && e.range && e.range.getSheet().getName();
    if (n === CONFIG.SHEET_SCHOOLS) CacheService.getScriptCache().remove(CONFIG.CACHE_KEY);
    if (n === CONFIG.SHEET_TEACHERS) CacheService.getScriptCache().remove(TEACHER_CACHE_KEY);
  } catch (err) { /* bỏ qua */ }
}

/** Chỉ cho phép chạy từ menu Sheet (chặn gọi từ trình duyệt qua google.script.run). */
function requireSheetUi_() {
  try {
    return SpreadsheetApp.getUi();
  } catch (e) {
    throw new Error('Chức năng này chỉ chạy từ menu "🔗 QR Trường" trong Google Sheet.');
  }
}

function setup() {
  const ui = requireSheetUi_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty(PROP_SS_ID, ss.getId());

  // Tab danh sách trường
  const s = ensureSheet_(ss, CONFIG.SHEET_SCHOOLS, SCHOOL_HEADERS);
  s.getRange('A:A').setNumberFormat('@'); // Mã dạng chữ để giữ số 0 đầu
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([CONFIG.STATUS_ACTIVE, CONFIG.STATUS_HIDDEN], true)
    .setAllowInvalid(false)
    .build();
  s.getRange(2, 5, Math.max(s.getMaxRows() - 1, 1), 1).setDataValidation(statusRule);
  s.setColumnWidth(1, 60).setColumnWidth(2, 90).setColumnWidth(3, 380)
    .setColumnWidth(4, 360).setColumnWidth(5, 110);

  // Tab nhật ký
  const log = ensureSheet_(ss, CONFIG.SHEET_LOG, LOG_HEADERS);
  log.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm:ss');
  log.getRange('C:D').setNumberFormat('@');
  log.setColumnWidth(1, 150).setColumnWidth(2, 180).setColumnWidth(3, 160)
    .setColumnWidth(5, 320).setColumnWidth(7, 300).setColumnWidth(9, 220);

  // Tab danh sách giáo viên
  const tch = ensureSheet_(ss, CONFIG.SHEET_TEACHERS, TEACHER_HEADERS);
  tch.getRange('A:A').setNumberFormat('@');
  tch.getRange('C:C').setNumberFormat('@'); // giữ số 0 đầu của số điện thoại
  tch.getRange(2, 4, Math.max(tch.getMaxRows() - 1, 1), 1).setDataValidation(statusRule);
  tch.setColumnWidth(1, 90).setColumnWidth(2, 220).setColumnWidth(3, 140).setColumnWidth(4, 110).setColumnWidth(5, 240);

  // Tab thống kê
  if (!ss.getSheetByName(CONFIG.SHEET_STATS)) ss.insertSheet(CONFIG.SHEET_STATS);

  CacheService.getScriptCache().remove(CONFIG.CACHE_KEY);
  refreshStats();
  ui.alert('Đã khởi tạo xong',
    'Các tab "' + CONFIG.SHEET_SCHOOLS + '", "' + CONFIG.SHEET_LOG + '", "' + CONFIG.SHEET_STATS + '" đã sẵn sàng.\n\n' +
    'Bước tiếp theo: dán danh sách trường vào tab ' + CONFIG.SHEET_SCHOOLS + ' (từ dòng 2), ' +
    'cột E chọn "' + CONFIG.STATUS_ACTIVE + '" hoặc "' + CONFIG.STATUS_HIDDEN + '".',
    ui.ButtonSet.OK);
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const first = sh.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const isEmpty = first.join('').trim() === '';
  const isHeader = fold_(first[0]) === fold_(headers[0]);
  if (!isEmpty && !isHeader) sh.insertRowBefore(1); // dòng 1 đang là dữ liệu → chèn dòng tiêu đề
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1a56db').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  return sh;
}

function refreshSchoolCache() {
  requireSheetUi_();
  CacheService.getScriptCache().remove(CONFIG.CACHE_KEY);
  SpreadsheetApp.getActiveSpreadsheet().toast('Web đã dùng danh sách mới nhất ngay từ lượt truy cập tiếp theo.', 'Đã làm mới danh sách', 5);
}

function validateSchoolList() {
  const ui = requireSheetUi_();
  const sh = getSpreadsheet_().getSheetByName(CONFIG.SHEET_SCHOOLS);
  const last = sh.getLastRow();
  if (last < 2) { ui.alert('Tab ' + CONFIG.SHEET_SCHOOLS + ' chưa có dữ liệu.'); return; }
  const rows = sh.getRange(2, 1, last - 1, 5).getDisplayValues();
  const seen = {};
  const issues = [];
  let active = 0, hidden = 0, noLink = 0;
  rows.forEach(function (r, i) {
    const rowNo = i + 2;
    const code = String(r[0]).trim();
    if (!code && !String(r[2]).trim()) return;
    if (!code) { issues.push('Dòng ' + rowNo + ': thiếu Mã.'); return; }
    if (seen[code]) issues.push('Dòng ' + rowNo + ': Mã "' + code + '" trùng với dòng ' + seen[code] + ' (web chỉ dùng dòng ' + seen[code] + ').');
    else seen[code] = rowNo;
    if (!String(r[1]).trim()) issues.push('Dòng ' + rowNo + ': thiếu Cụm.');
    if (!String(r[2]).trim()) issues.push('Dòng ' + rowNo + ': thiếu Tên đơn vị.');
    const st = fold_(r[4]);
    if (st === fold_(CONFIG.STATUS_ACTIVE)) active++;
    else if (st === fold_(CONFIG.STATUS_HIDDEN)) hidden++;
    else issues.push('Dòng ' + rowNo + ': Trạng thái "' + r[4] + '" không hợp lệ (trường sẽ KHÔNG hiện trên web).');
    const link = String(r[3]).trim();
    if (!link) noLink++;
    else if (!isValidLink_(link)) issues.push('Dòng ' + rowNo + ': link không hợp lệ (phải bắt đầu bằng https://).');
  });
  const summary = 'Hoạt động: ' + active + ' | Ẩn: ' + hidden + ' | Chưa có link: ' + noLink;
  ui.alert('Kiểm tra danh sách trường',
    summary + '\n\n' + (issues.length ? issues.slice(0, 40).join('\n') + (issues.length > 40 ? '\n…' : '') : 'Không phát hiện lỗi.'),
    ui.ButtonSet.OK);
}

/* =====================================================================
 *  5. THỐNG KÊ
 * ===================================================================== */

function refreshStats() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { /* chạy từ trigger */ }
  buildStats_();
  if (ui) SpreadsheetApp.getActiveSpreadsheet().toast('Đã cập nhật tab ' + CONFIG.SHEET_STATS + '.', 'Thống kê', 4);
}

/** Hàm cho trigger thời gian (không cần UI). */
function autoRefreshStats(e) {
  if (!e || !e.triggerUid) return; // chỉ chạy khi được gọi bởi trigger
  buildStats_();
}

function installStatsTrigger() {
  const ui = requireSheetUi_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'autoRefreshStats') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoRefreshStats').timeBased().everyMinutes(10).create();
  ui.alert('Đã bật: tab ' + CONFIG.SHEET_STATS + ' sẽ tự cập nhật mỗi 10 phút.');
}

function buildStats_() {
  const ss = getSpreadsheet_();
  const schools = readSchoolsFromSheet_();
  const logSh = ss.getSheetByName(CONFIG.SHEET_LOG);
  const logRows = (logSh && logSh.getLastRow() > 1)
    ? logSh.getRange(2, 4, logSh.getLastRow() - 1, 5).getDisplayValues() // D..H
    : [];

  const blank = function () { return { total: 0, ok: 0, nolink: 0, err: 0 }; };
  const inc = function (o, st) {
    o.total++;
    if (st === LOG_STATUS.OK) o.ok++;
    else if (st === LOG_STATUS.NOLINK) o.nolink++;
    else o.err++;
  };
  const bySchool = {}, byCluster = {}, clusterOrder = [], extraCodes = [];
  schools.forEach(function (s) {
    if (byCluster[s.cluster] === undefined) { byCluster[s.cluster] = blank(); clusterOrder.push(s.cluster); }
  });
  const known = {};
  schools.forEach(function (s) { known[s.code] = s; });

  logRows.forEach(function (r) {
    const code = String(r[0]).trim() || '(không rõ)';
    const cluster = String(r[2]).trim() || (known[code] ? known[code].cluster : '(không rõ)');
    const st = String(r[4]).trim();
    if (!bySchool[code]) { bySchool[code] = blank(); if (!known[code]) extraCodes.push({ code: code, name: String(r[1]).trim(), cluster: cluster }); }
    if (byCluster[cluster] === undefined) { byCluster[cluster] = blank(); clusterOrder.push(cluster); }
    inc(bySchool[code], st);
    inc(byCluster[cluster], st);
  });

  let sh = ss.getSheetByName(CONFIG.SHEET_STATS);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_STATS);
  sh.clear();

  const tz = ss.getSpreadsheetTimeZone();
  const out = [];
  out.push(['THỐNG KÊ LƯỢT TRUY CẬP (lượt gửi form)', '', '', '', '', '', '', '']);
  out.push(['Cập nhật lúc: ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm:ss'), '', '', '', '', '', '', '']);
  out.push(['', '', '', '', '', '', '', '']);
  const clusterTitleRow = out.length + 1;
  out.push(['THEO CỤM', '', '', '', '', '', '', '']);
  out.push(['Cụm', 'Tổng lượt', 'Thành công', 'Chưa có link', 'Lỗi', '', '', '']);
  const tot = blank();
  clusterOrder.forEach(function (c) {
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
  schools.forEach(function (s) {
    const o = bySchool[s.code] || blank();
    out.push(["'" + s.code, s.cluster, s.name, s.statusText, o.total, o.ok, o.nolink, o.err]);
  });
  extraCodes.forEach(function (x) {
    const o = bySchool[x.code];
    out.push(["'" + x.code, x.cluster, x.name || '(không có trong danh sách)', '—', o.total, o.ok, o.nolink, o.err]);
  });

  sh.getRange(1, 1, out.length, 8).setValues(out);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1).setFontStyle('italic').setFontColor('#666666');
  [clusterTitleRow, schoolTitleRow].forEach(function (r) { sh.getRange(r, 1).setFontWeight('bold').setFontColor('#1a56db'); });
  sh.getRange(clusterTitleRow + 1, 1, 1, 5).setFontWeight('bold').setBackground('#e8eefc');
  sh.getRange(clusterTotalRow, 1, 1, 5).setFontWeight('bold');
  sh.getRange(schoolHeaderRow, 1, 1, 8).setFontWeight('bold').setBackground('#e8eefc');
  sh.setColumnWidth(1, 110).setColumnWidth(3, 360);
  sh.setFrozenRows(0);
}

/* =====================================================================
 *  6. TIỆN ÍCH
 * ===================================================================== */

/** Bỏ dấu tiếng Việt + chữ thường + gọn khoảng trắng. */
function fold_(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/* Quy tắc kiểm tra Họ tên / Chức vụ (giống hệt trang form). */
const NAME_RE_ = /^[\p{L}\p{M}]+(?:[ .'’-]+[\p{L}\p{M}]+)*\.?$/u;
function checkName_(n) {
  if (!n) return 'Vui lòng nhập họ và tên.';
  if (n.length < 4 || n.length > 60) return 'Họ và tên phải từ 4 đến 60 ký tự.';
  if (/\d/.test(n)) return 'Họ và tên không được chứa chữ số.';
  if (!NAME_RE_.test(n)) return 'Họ và tên chỉ được gồm chữ cái và khoảng trắng.';
  if (n.split(' ').length < 2) return 'Vui lòng nhập đầy đủ họ và tên (ít nhất 2 từ).';
  return '';
}

function clean_(v, maxLen) {
  return String(v == null ? '' : v).normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function hash_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes);
}

/** JSON an toàn để nhúng vào thẻ <script>. */
function safeJson_(o) {
  return JSON.stringify(o)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/* =====================================================================
 *  7. PHÂN QUYỀN: DANH SÁCH GIÁO VIÊN + XEM TÀI LIỆU QUA PHIÊN TẠM
 *  - Người dùng KHÔNG bao giờ nhận link thư mục Drive.
 *  - Gửi form đúng (họ tên + SĐT khớp tab DanhSachGiaoVien của đúng trường)
 *    → nhận 1 mã phiên (30 phút) chỉ mở được thư mục của trường đó.
 *  - Mỗi thư mục/file chỉ mở được nếu nó đã xuất hiện trong lần liệt kê
 *    bắt đầu từ thư mục gốc của trường → không thể đoán id để xem trường khác.
 * ===================================================================== */

const TEACHER_CACHE_KEY = 'teachers_v1';

/** Chuẩn hoá SĐT: bỏ khoảng trắng . - ( ), +84/84 → 0. */
function normPhone_(v) {
  let s = String(v == null ? '' : v).replace(/[\s.\-()]/g, '');
  if (/^\+84\d+$/.test(s)) s = '0' + s.slice(3);
  else if (/^84\d{9}$/.test(s)) s = '0' + s.slice(2);
  else if (/^\d{9}$/.test(s) && s[0] !== '0') s = '0' + s; // Sheet làm mất số 0 đầu
  return s.slice(0, 20);
}
function checkPhone_(p) {
  if (!p) return 'Vui lòng nhập số điện thoại.';
  if (!/^\d+$/.test(p)) return 'Số điện thoại chỉ gồm chữ số.';
  if (!/^0\d{9}$/.test(p)) return 'Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0.';
  return '';
}
function maskPhone_(p) {
  p = String(p || '');
  return p.length >= 7 ? p.slice(0, 3) + '****' + p.slice(-3) : p;
}

/** { "05|0912345678": ["nguyen van an", ...] } – chỉ giáo viên đang Hoạt động. */
function getTeacherIndex_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(TEACHER_CACHE_KEY);
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* đọc lại */ } }
  const sh = getSpreadsheet_().getSheetByName(CONFIG.SHEET_TEACHERS);
  const idx = {};
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues().forEach(function (r) {
      const code = normCode_(r[0]);
      const phone = normPhone_(r[2]);
      const st = fold_(r[3]);
      if (!code || !phone || (st && st !== fold_(CONFIG.STATUS_ACTIVE))) return;
      const k = code + '|' + phone;
      (idx[k] = idx[k] || []).push(fold_(r[1]));
    });
  }
  try { cache.put(TEACHER_CACHE_KEY, JSON.stringify(idx), CONFIG.CACHE_SECONDS); } catch (e) { console.warn(e); }
  return idx;
}
/** "5" → "05" để khớp mã trường trong DanhSachTruong. */
function normCode_(v) {
  const s = String(v == null ? '' : v).trim();
  return /^\d{1,3}$/.test(s) ? (s.length === 1 ? '0' + s : s) : s;
}
/** So khớp họ tên không phân biệt hoa thường / dấu, và SĐT chính xác. */
function isTeacherOf_(code, name, phone) {
  const names = getTeacherIndex_()[normCode_(code) + '|' + phone];
  return !!names && names.indexOf(fold_(name)) >= 0;
}

function folderIdFromLink_(url) {
  if (!isValidLink_(url)) return '';
  const m = String(url).match(/\/folders\/([\w-]{10,})/) || String(url).match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : '';
}

/* ---------- Phiên xem tài liệu ---------- */
function createSession_(info) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const sess = { code: info.code, root: info.root, name: info.name, phone: info.phone,
    exp: Date.now() + CONFIG.SESSION_SECONDS * 1000, allow: [info.root] };
  CacheService.getScriptCache().put('ss_' + token, JSON.stringify(sess), CONFIG.SESSION_SECONDS);
  return token;
}
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
function saveSession_(token, sess) {
  sess.exp = Date.now() + CONFIG.SESSION_SECONDS * 1000;
  if (sess.allow.length > 3000) sess.allow = sess.allow.slice(-3000);
  CacheService.getScriptCache().put('ss_' + token, JSON.stringify(sess), CONFIG.SESSION_SECONDS);
}
const EXPIRED_ = { status: 'expired', message: 'Phiên xem tài liệu đã hết hạn do lâu không sử dụng. Vui lòng điền lại biểu mẫu.' };
const FORBIDDEN_ = { status: 'forbidden', message: 'Bạn không có quyền xem mục này.' };

/** POST {action:'list', token, folderId?} → thư mục con + file của thư mục (chỉ trong trường của phiên). */
function apiList_(p) {
  const token = String(p.token || '');
  const lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    const sess = loadSession_(token);
    if (!sess) return EXPIRED_;
    const fid = String(p.folderId || sess.root);
    if (!/^[\w-]{10,}$/.test(fid) || sess.allow.indexOf(fid) < 0) return FORBIDDEN_;
    const folder = DriveApp.getFolderById(fid);
    const folders = [], files = [];
    const fi = folder.getFolders();
    while (fi.hasNext() && folders.length < 300) {
      const f = fi.next();
      if (f.isTrashed()) continue;
      folders.push({ id: f.getId(), name: f.getName() });
    }
    const it = folder.getFiles();
    while (it.hasNext() && files.length < 500) {
      const f = it.next();
      const mime = f.getMimeType();
      if (f.isTrashed() || mime === 'application/vnd.google-apps.shortcut') continue; // lối tắt có thể trỏ ra ngoài trường
      files.push({ id: f.getId(), name: f.getName(), mime: mime, size: f.getSize(),
        updated: Utilities.formatDate(f.getLastUpdated(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy') });
    }
    const byName = function (a, b) { return a.name.localeCompare(b.name, 'vi', { numeric: true }); };
    folders.sort(byName); files.sort(byName);
    folders.concat(files).forEach(function (x) { if (sess.allow.indexOf(x.id) < 0) sess.allow.push(x.id); });
    saveSession_(token, sess);
    return { status: 'ok', folderId: fid, isRoot: fid === sess.root, folderName: folder.getName(),
      folders: folders, files: files, expiresIn: Math.floor((sess.exp - Date.now()) / 1000) };
  } finally {
    try { lock.releaseLock(); } catch (e) { /* bỏ qua */ }
  }
}

/** POST {action:'file', token, fileId} → nội dung file (base64). File Google Docs/Sheets/Slides xuất ra PDF. */
function apiFile_(p) {
  const sess = loadSession_(p.token);
  if (!sess) return EXPIRED_;
  const id = String(p.fileId || '');
  if (!/^[\w-]{10,}$/.test(id) || sess.allow.indexOf(id) < 0) return FORBIDDEN_;
  const f = DriveApp.getFileById(id);
  const mime = f.getMimeType();
  let blob, name = f.getName();
  if (/^application\/vnd\.google-apps\./.test(mime)) {
    blob = f.getAs('application/pdf');
    if (!/\.pdf$/i.test(name)) name += '.pdf';
  } else {
    if (f.getSize() > CONFIG.MAX_FILE_BYTES) {
      return { status: 'too_big', message: 'File quá lớn để mở qua trang web (trên 25MB). Vui lòng liên hệ ' + CONFIG.ORG_CONTACT + '.' };
    }
    blob = f.getBlob();
  }
  const bytes = blob.getBytes();
  if (bytes.length > CONFIG.MAX_FILE_BYTES) {
    return { status: 'too_big', message: 'File quá lớn để mở qua trang web (trên 25MB). Vui lòng liên hệ ' + CONFIG.ORG_CONTACT + '.' };
  }
  return { status: 'ok', name: name, mime: blob.getContentType() || mime, data: Utilities.base64Encode(bytes) };
}

/* ---------- Menu: kiểm tra danh sách giáo viên ---------- */
function validateTeacherList() {
  const ui = requireSheetUi_();
  const ss = getSpreadsheet_();
  const sh = ensureSheet_(ss, CONFIG.SHEET_TEACHERS, TEACHER_HEADERS);
  CacheService.getScriptCache().remove(TEACHER_CACHE_KEY);
  const last = sh.getLastRow();
  if (last < 2) { ui.alert('Tab ' + CONFIG.SHEET_TEACHERS + ' chưa có dữ liệu.\nCột: ' + TEACHER_HEADERS.join(' | ')); return; }
  const codes = {};
  readSchoolsFromSheet_().forEach(function (s) { codes[s.code] = s; });
  const issues = [], seen = {}, perSchool = {};
  let ok = 0;
  sh.getRange(2, 1, last - 1, 4).getDisplayValues().forEach(function (r, i) {
    const row = i + 2;
    if (!r.join('').trim()) return;
    const code = normCode_(r[0]), phone = normPhone_(r[2]), name = clean_(r[1], 100);
    if (!codes[code]) { issues.push('Dòng ' + row + ': mã trường "' + r[0] + '" không có trong ' + CONFIG.SHEET_SCHOOLS + '.'); return; }
    const en = checkName_(name); if (en) { issues.push('Dòng ' + row + ': ' + en); return; }
    const ep = checkPhone_(phone); if (ep) { issues.push('Dòng ' + row + ': ' + ep + ' ("' + r[2] + '")'); return; }
    const st = fold_(r[3]);
    if (st && st !== fold_(CONFIG.STATUS_ACTIVE) && st !== fold_(CONFIG.STATUS_HIDDEN)) issues.push('Dòng ' + row + ': Trạng thái "' + r[3] + '" không hợp lệ.');
    const k = code + '|' + phone + '|' + fold_(name);
    if (seen[k]) issues.push('Dòng ' + row + ': trùng với dòng ' + seen[k] + '.'); else seen[k] = row;
    perSchool[code] = (perSchool[code] || 0) + 1;
    ok++;
  });
  const none = Object.keys(codes).filter(function (c) { return codes[c].active && !perSchool[c]; });
  ui.alert('Kiểm tra danh sách giáo viên',
    'Hợp lệ: ' + ok + ' giáo viên ở ' + Object.keys(perSchool).length + ' trường.\n' +
    (none.length ? 'Trường chưa có giáo viên nào (không ai vào được): ' + none.join(', ') + '\n' : '') +
    '\n' + (issues.length ? issues.slice(0, 40).join('\n') + (issues.length > 40 ? '\n…' : '') : 'Không phát hiện lỗi.'),
    ui.ButtonSet.OK);
}

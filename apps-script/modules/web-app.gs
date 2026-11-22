/**
 * web-app.gs
 * ─────────────────────────────────────────────
 * Entry point của Google Apps Script Web App.
 *
 * doGet()   → Phục vụ HTML hoặc danh sách trường (GET ?api=schools)
 * doPost()  → Nhận form submit, action='list', action='file'
 *
 * Tất cả logic nghiệp vụ được tách sang các module:
 *   config.gs       → Hằng số
 *   utils.gs        → Tiện ích (fold_, clean_, json_…)
 *   validation.gs   → Kiểm tra họ tên, SĐT, link…
 *   school-data.gs  → Đọc danh sách trường (có cache)
 *   teacher-auth.gs → Xác thực giáo viên + quản lý phiên
 *   rate-limit.gs   → Chống spam
 *   drive-api.gs    → Liệt kê thư mục / đọc file Drive
 *   sheet-setup.gs  → Menu, khởi tạo tab, thống kê
 * ─────────────────────────────────────────────
 */

// ── GET ───────────────────────────────────────────────────────────────────

/**
 * Xử lý GET request:
 *  - ?api=schools → trả JSON danh sách trường công khai + config UI
 *  - Ngược lại   → chuyển hướng sang FORM_PAGE_URL (hoặc render HTML trực tiếp)
 */
function doGet(e) {
  // API: danh sách trường
  if (e && e.parameter && e.parameter.api === 'schools') {
    try {
      return json_({
        ok: true,
        schools: getPublicSchools_(),
        config: {
          title:    CONFIG.EVENT_TITLE,
          subtitle: CONFIG.EVENT_SUBTITLE,
          privacy:  CONFIG.PRIVACY_NOTE,
          contact:  CONFIG.ORG_CONTACT,
        },
      });
    } catch (err) {
      console.error(err);
      return json_({
        ok: false,
        message: 'Không tải được danh sách trường. Vui lòng tải lại trang hoặc liên hệ ' + CONFIG.ORG_CONTACT,
      });
    }
  }

  // Chuyển hướng sang trang form ngoài (Netlify)
  if (CONFIG.FORM_PAGE_URL) {
    return HtmlService.createHtmlOutput(
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<div style="font:17px system-ui,sans-serif;max-width:520px;margin:40px auto;padding:16px;text-align:center">' +
      '<p>Trang hồ sơ đã chuyển sang địa chỉ mới.</p>' +
      `<p><a target="_top" style="display:inline-block;padding:14px 22px;background:#1a56db;color:#fff;border-radius:10px;text-decoration:none;font-weight:700" href="${CONFIG.FORM_PAGE_URL}">Mở trang hồ sơ</a></p></div>`
    ).setTitle(CONFIG.EVENT_TITLE);
  }

  // Render HTML trực tiếp từ template (khi không có FORM_PAGE_URL)
  const t = HtmlService.createTemplateFromFile('index');
  const pre = (e && e.parameter && e.parameter.ma)
    ? String(e.parameter.ma).trim().slice(0, 20)
    : '';
  let schools = [], loadError = '';

  try { schools = getPublicSchools_(); }
  catch (err) {
    console.error(err);
    loadError = 'Không tải được danh sách trường. Vui lòng tải lại hoặc liên hệ: ' + CONFIG.ORG_CONTACT;
  }

  t.schoolsJson = safeJson_(schools);
  t.configJson  = safeJson_({
    title: CONFIG.EVENT_TITLE, subtitle: CONFIG.EVENT_SUBTITLE,
    privacy: CONFIG.PRIVACY_NOTE, contact: CONFIG.ORG_CONTACT,
    preselect: pre, loadError,
  });

  return t.evaluate()
    .setTitle(CONFIG.EVENT_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ── POST ──────────────────────────────────────────────────────────────────

/**
 * Xử lý POST request từ trang form.
 * Routing dựa trên trường `action` trong body JSON.
 */
function doPost(e) {
  let p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { p = {}; }

  try {
    if (p.action === 'list') return json_(apiList_(p));
    if (p.action === 'file') return json_(apiFile_(p));
  } catch (err) {
    console.error(err);
    return json_({ status: 'error', message: 'Hệ thống đang bận. Vui lòng thử lại sau giây lát.' });
  }

  // Mặc định: xử lý submit form xác thực
  return json_(submitForm_(p));
}

// ── Submit form ───────────────────────────────────────────────────────────

/**
 * Xử lý đăng nhập: kiểm tra danh sách giáo viên, ghi log, tạo phiên.
 * @param {object} p - Body đã parse
 * @returns {object} Phản hồi JSON
 */
function submitForm_(p) {
  p = p || {};
  const now = new Date();

  // 1. Chống spam: honeypot + thời gian điền form
  if (clean_(p.website, 200) !== '') {
    return { status: 'error', message: 'Không thể gửi biểu mẫu. Vui lòng tải lại trang và thử lại.' };
  }
  if ((Number(p.elapsedMs) || 0) < CONFIG.MIN_FILL_MS) {
    return { status: 'error', message: 'Bạn bấm gửi quá nhanh. Vui lòng kiểm tra lại thông tin rồi bấm "Gửi" lần nữa.' };
  }

  // 2. Làm sạch & kiểm tra dữ liệu
  const name   = clean_(p.fullName, 100);
  const phone  = normPhone_(p.phone);
  const code   = clean_(p.schoolCode, 20);
  const device = clean_(p.deviceId, 64);

  const errors = {};
  const en = checkName_(name);  if (en) errors.fullName  = en;
  const ep = checkPhone_(phone); if (ep) errors.phone     = ep;
  if (!/^\d{1,3}$/.test(code))       errors.schoolCode = 'Vui lòng chọn trường từ danh sách.';
  if (Object.keys(errors).length)    return { status: 'invalid_input', errors };

  // 3. Rate limit
  const rateKeys = [
    { key: 'n_' + fold_(name), max: CONFIG.RATE_MAX_PER_NAME },
    { key: 'p_' + phone,       max: CONFIG.RATE_MAX_PER_NAME },
  ];
  if (device) rateKeys.push({ key: 'd_' + device, max: CONFIG.RATE_MAX_PER_DEVICE });

  const failKeys = [{ key: 'fs_' + code, max: CONFIG.RATE_MAX_FAIL_PER_SCHOOL }];
  if (device) failKeys.push({ key: 'fd_' + device, max: CONFIG.RATE_MAX_FAIL_PER_DEVICE });

  if (!peekRateLimit_(failKeys) || !checkRateLimit_(rateKeys)) {
    return {
      status: 'error',
      message: `Bạn đã gửi quá nhiều lần trong thời gian ngắn. Vui lòng thử lại sau ít phút hoặc liên hệ ban tổ chức: ${CONFIG.ORG_CONTACT}`,
    };
  }

  try {
    const school = getSchools_().find((s) => s.code === code);

    // Mã không tồn tại hoặc trường đang ẩn
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

    // Xác thực giáo viên
    if (!isTeacherOf_(code, name, phone)) {
      checkRateLimit_(failKeys);
      writeLog_([now, name, maskPhone_(phone), code, school.name, school.cluster, '',
        LOG_STATUS.DENIED, 'Không khớp danh sách giáo viên']);
      return {
        status: 'denied',
        message: `Họ tên hoặc số điện thoại không khớp với danh sách giáo viên của trường đã chọn. Vui lòng kiểm tra lại, hoặc liên hệ ${CONFIG.ORG_CONTACT} để được bổ sung.`,
      };
    }

    // Trường chưa có link Drive
    const rootId = folderIdFromLink_(school.link);
    if (!rootId) {
      writeLog_([now, name, maskPhone_(phone), code, school.name, school.cluster, '',
        LOG_STATUS.NOLINK, school.link ? 'Link sai định dạng: ' + school.link.slice(0, 100) : '']);
      return {
        status: 'nolink',
        schoolName: school.name,
        cluster:    school.cluster,
        message:    `Thư mục của trường đang được cập nhật, vui lòng liên hệ ban tổ chức ${CONFIG.ORG_CONTACT}.`,
      };
    }

    // Thành công – tạo phiên
    writeLog_([now, name, maskPhone_(phone), code, school.name, school.cluster, school.link, LOG_STATUS.OK, '']);
    const token = createSession_({ code, root: rootId, name, phone: maskPhone_(phone) });
    return { status: 'ok', token, rootId, schoolName: school.name, cluster: school.cluster, expiresIn: CONFIG.SESSION_SECONDS };

  } catch (err) {
    console.error(err);
    try {
      writeLog_([now, name, maskPhone_(phone), code, '', '', '', LOG_STATUS.ERR, 'Lỗi hệ thống: ' + String(err).slice(0, 200)]);
    } catch (e2) { console.error(e2); }
    return { status: 'error', message: 'Hệ thống đang bận. Vui lòng thử lại sau giây lát.' };
  }
}

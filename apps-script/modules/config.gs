/**
 * config.gs
 * ─────────────────────────────────────────────
 * Hằng số cấu hình toàn bộ ứng dụng.
 * Chỉ sửa tại đây – không sửa rải rác trong code.
 * ─────────────────────────────────────────────
 */

// ── Nội dung hiển thị ─────────────────────────────────────────────────────

const CONFIG = {
  /** Tiêu đề hiển thị trên trang web */
  EVENT_TITLE: 'Hồ sơ thiết bị các đơn vị',

  /** Phụ đề bên dưới tiêu đề */
  EVENT_SUBTITLE:
    'Điền thông tin bên dưới để mở thư mục biên bản danh mục thiết bị, hợp đồng và tài liệu của đơn vị.',

  /** Thông tin liên hệ ban tổ chức (hiện khi trường chưa có link) */
  ORG_CONTACT: 'Ban tổ chức (Sở GD&ĐT) tại sự kiện',

  /**
   * URL trang form ngoài (Netlify).
   * Nếu đặt, Apps Script sẽ chuyển hướng GET về URL này thay vì render HTML.
   */
  FORM_PAGE_URL: 'https://heartfelt-brioche-d58fc5.netlify.app/',

  /** Ghi chú mục đích sử dụng thông tin cá nhân */
  PRIVACY_NOTE:
    'Thông tin bạn cung cấp (họ tên, số điện thoại, đơn vị) chỉ được Ban tổ chức dùng để ghi nhận ' +
    'đại diện đơn vị truy cập hồ sơ tại sự kiện và lập thống kê. Thông tin không được chia sẻ cho bên thứ ba ' +
    'và sẽ được xoá sau khi kết thúc công tác bàn giao. Bấm "Gửi" nghĩa là bạn đồng ý với mục đích này.',

  // ── Tên các tab Google Sheet ───────────────────────────────────────────
  SHEET_SCHOOLS:  'DanhSachTruong',
  SHEET_LOG:      'NhatKy',
  SHEET_STATS:    'ThongKe',
  SHEET_TEACHERS: 'DanhSachGiaoVien',

  // ── Phiên & giới hạn file ─────────────────────────────────────────────
  /** Số giây trước khi phiên xem tài liệu hết hạn (tối đa CacheService = 21600) */
  SESSION_SECONDS: 21600,     // 6 giờ

  /** Dung lượng file tối đa được phép tải qua web (bytes) */
  MAX_FILE_BYTES: 25 * 1024 * 1024,  // 25 MB

  // ── Chống spam / rate limit ───────────────────────────────────────────
  /** Cửa sổ thời gian tính lượt gửi (giây) */
  RATE_WINDOW_SECONDS: 600,   // 10 phút

  /** Tối đa N lượt / cùng họ tên hoặc số điện thoại / cửa sổ */
  RATE_MAX_PER_NAME: 5,

  /** Tối đa N lượt / thiết bị / cửa sổ */
  RATE_MAX_PER_DEVICE: 5,

  /** Tối đa N lần nhập sai / trường / cửa sổ */
  RATE_MAX_FAIL_PER_SCHOOL: 20,

  /** Tối đa N lần nhập sai / thiết bị / cửa sổ */
  RATE_MAX_FAIL_PER_DEVICE: 5,

  /**
   * Thời gian điền tối thiểu (ms).
   * Gửi nhanh hơn ngưỡng này bị coi là bot.
   */
  MIN_FILL_MS: 3000,

  // ── Cache danh sách trường ────────────────────────────────────────────
  CACHE_KEY: 'schools_v1',
  CACHE_SECONDS: 300,         // 5 phút

  // ── Giá trị cột Trạng thái ────────────────────────────────────────────
  STATUS_ACTIVE: 'Hoạt động',
  STATUS_HIDDEN: 'Ẩn',
};

// ── Tiêu đề cột các tab ───────────────────────────────────────────────────

const SCHOOL_HEADERS  = ['Mã', 'Cụm', 'Tên đơn vị', 'Link thư mục Drive', 'Trạng thái'];
const TEACHER_HEADERS = ['Mã trường', 'Họ và tên', 'Số điện thoại', 'Trạng thái', 'Ghi chú'];
const LOG_HEADERS     = [
  'Thời gian', 'Họ tên', 'Số điện thoại', 'Mã trường',
  'Tên trường', 'Cụm', 'Link đã chuyển tới', 'Trạng thái', 'Ghi chú',
];
const LOG_STATUS = { OK: 'Thành công', NOLINK: 'Chưa có link', ERR: 'Lỗi', DENIED: 'Không khớp' };

/** Script property key lưu Spreadsheet ID (dùng khi script chạy standalone) */
const PROP_SS_ID = 'SPREADSHEET_ID';

# 📁 Cấu trúc dự án – QR Hồ sơ Thiết bị Đơn vị

> **Mục đích:** Hệ thống cho phép cán bộ quét QR → điền form xác thực → xem thư mục tài liệu Drive của trường.  
> **Stack:** Vanilla HTML/CSS/JS (ES Modules) · Google Apps Script · Google Sheets · Google Drive

---

## Tổng quan cây thư mục

```
QR_code_src_moi/
│
├── index.html                        # Entry point duy nhất – giao diện người dùng
│
├── src/                              # Toàn bộ source code frontend
│   ├── STRUCTURE.md                  # 📄 File này – mô tả cấu trúc dự án
│   │
│   ├── css/                          # Stylesheet tách theo trách nhiệm (Separation of Concerns)
│   │   ├── variables.css             # Design tokens (màu, shadow, bo góc)
│   │   ├── base.css                  # Reset CSS & typography cơ bản
│   │   ├── layout.css                # Header banner, card, wrapper, footer
│   │   ├── form.css                  # Input, label, nút, thông báo lỗi / banner
│   │   ├── combobox.css              # Combobox tìm kiếm trường có dấu / không dấu
│   │   └── document-viewer.css       # Trình xem thư mục & file Drive (breadcrumb, timer…)
│   │
│   └── js/                           # JavaScript ES Modules
│       ├── app.js                    # ★ Entry point – điều phối toàn bộ luồng ứng dụng
│       └── modules/                  # Các module độc lập, dễ test riêng
│           ├── utils.js              # Hàm tiện ích thuần (fold, esc, highlight, fmtSize…)
│           ├── validation.js         # Quy tắc kiểm tra họ tên, số điện thoại (mirror server)
│           ├── api.js                # Lớp giao tiếp với Apps Script Web App (fetch)
│           ├── combobox.js           # Logic combobox: tìm kiếm, keyboard nav, highlight
│           └── document-viewer.js    # Trình xem tài liệu Drive qua session token
│
├── apps-script/                      # Google Apps Script (backend)
│   ├── appsscript.json               # Manifest: timezone, runtime V8, quyền Web App
│   ├── DongBoDrive.gs                # Đồng bộ danh sách trường từ cấu trúc thư mục Drive
│   └── modules/                      # Các module .gs tách theo trách nhiệm
│       ├── config.gs                 # ★ Hằng số CONFIG – chỉ sửa tại đây
│       ├── utils.gs                  # Tiện ích server: fold_, clean_, json_, hash_…
│       ├── validation.gs             # Kiểm tra dữ liệu server (mirror client validation.js)
│       ├── school-data.gs            # Đọc & cache danh sách trường từ Google Sheet
│       ├── teacher-auth.gs           # Xác thực giáo viên + quản lý session token
│       ├── rate-limit.gs             # Chống spam (CacheService + LockService)
│       ├── drive-api.gs              # API liệt kê thư mục / đọc file Drive
│       ├── sheet-setup.gs            # Menu, khởi tạo tab Sheet, nhật ký, thống kê
│       └── web-app.gs                # ★ Entry point GAS: doGet() / doPost() routing
│
├── assets/
│   └── logo/                         # Logo, hình ảnh tĩnh
│
├── docs/                             # Tài liệu kỹ thuật bổ sung
├── DanhSachTruong.csv                # Mẫu dữ liệu danh sách trường
├── QR_ho_so_truong.png               # Mã QR trỏ tới trang form
├── link_web_app.txt                  # URL Web App đang deploy
└── README.md                         # Hướng dẫn triển khai tổng quát
```

---

## Chi tiết từng file

### 🌐 Frontend – `index.html`

| Mục | Nội dung |
|-----|----------|
| **Vai trò** | HTML shell duy nhất – không chứa CSS hay JS inline |
| **Load CSS** | 6 file CSS từ `src/css/` theo thứ tự phụ thuộc |
| **Load JS** | `<script type="module" src="src/js/app.js">` |
| **DOM chính** | `#form`, `#result`, `#banner`, `#combo`, `#panel`, `#list` |
| **Lưu ý** | Tương thích Chrome 61+, Firefox 60+, Safari 10.1+ (ES Modules native) |

---

### 🎨 CSS – `src/css/`

#### `variables.css` – Design Tokens
Định nghĩa toàn bộ biến CSS. **Chỉ sửa file này** khi muốn thay đổi màu sắc / style toàn ứng dụng.

```
--color-navy, --color-primary, --color-primary-dark, --color-primary-light
--color-bg, --color-card, --color-text, --color-muted
--color-border, --color-line
--color-error, --color-error-bg, --color-success-bg, --color-warning-bg, --color-warning
--radius, --shadow
```

#### `base.css` – Reset & Typography
- `box-sizing: border-box` toàn trang
- Font stack: `Be Vietnam Pro` + system fallback
- Class `.hp` (honeypot ẩn) và `[hidden]`

#### `layout.css` – Khung Bố Cục
- `.band` – Header gradient xanh navy
- `.band-in` – Container căn giữa max 560px
- `.org` / `.seal` – Logo + tên đơn vị
- `.wrap` – Vùng nội dung chính (card nổi lên trên header)
- `.card` / `.card-h` – Card trắng với shadow
- `footer`
- **Responsive:** breakpoint `700px`

#### `form.css` – Form Controls
- `label`, `.req` (dấu `*` đỏ)
- `.field` – Input với icon SVG tuyệt đối bên trái
- Input states: `:focus` (ring xanh), `.invalid` (viền đỏ)
- `.err` – Thông báo lỗi inline (tự ẩn khi rỗng)
- `.msg.error` / `.msg.warn` / `.msg.ok` – Banner thông báo
- `.btn` / `.btn.sec` – Nút primary / secondary
- `.secure` / `.priv` – Dòng bảo mật & ghi chú quyền riêng tư

#### `combobox.css` – Dropdown Tìm Trường
- `.combo-btn` – Nút trigger có icon toà nhà (CSS mask SVG)
- `.panel` – Overlay toàn màn hình (mobile) / absolute (desktop ≥700px)
- `.ph-head` – Thanh tìm kiếm + nút Đóng
- `.grp` – Nhóm cụm (sticky header)
- `.opt` – Mỗi dòng trường; `.opt.act` khi focus bàn phím
- `mark` – Highlight từ khoá tìm kiếm

#### `document-viewer.css` – Trình Xem Tài Liệu
- `.docs-head` – Tên trường + badge cụm + đồng hồ đếm ngược `.timer`
- `.crumbs` – Breadcrumb điều hướng thư mục
- `.item` – Mỗi dòng thư mục/file
- `.ic.*` – Icon màu theo loại: `.fd` (📁), `.pdf`, `.xls`, `.doc`, `.ppt`, `.img`
- `.act` – Nhóm nút Mở / Tải về

---

### ⚡ JavaScript – `src/js/`

#### `app.js` – Entry Point ★
Điều phối toàn bộ luồng ứng dụng. **Không chứa logic nghiệp vụ** – chỉ gọi các module.

```
Luồng:
  1. fetchSchools()       → Tải danh sách trường
  2. initCombobox()       → Khởi tạo combobox + event listeners
  3. form#submit          → validate() → submitForm() → onResponse()
  4. onResponse()
       ├─ 'ok'            → showDocumentViewer()
       ├─ 'nolink'        → showNoLink()
       ├─ 'denied'        → setErr() + showBanner()
       ├─ 'invalid_input' → setErr() từng trường
       └─ 'invalid_school'→ reload danh sách + setErr()
  5. backToForm()         → ẩn #result, hiện #form
```

#### `modules/utils.js` – Tiện Ích Thuần
Không phụ thuộc DOM, không có side effect.

| Export | Mô tả |
|--------|-------|
| `fold(s)` | Bỏ dấu tiếng Việt, chuyển thường, gọn khoảng trắng |
| `esc(s)` | Escape HTML chống XSS khi dùng innerHTML |
| `deviceId()` | Lấy / tạo ID thiết bị từ localStorage |
| `highlight(text, qf)` | Bọc từ khoá bằng `<mark>`, giữ nguyên dấu tiếng Việt |
| `fmtSize(n)` | Số byte → chuỗi KB / MB |
| `fileIcon(mime)` | MIME type → `[cssClass, nhãn]` |

#### `modules/validation.js` – Kiểm Tra Dữ Liệu Client

| Export | Mô tả |
|--------|-------|
| `norm(s)` | Chuẩn hoá chuỗi (NFC, bỏ ký tự điều khiển) |
| `checkName(name)` | Kiểm tra họ tên: độ dài, không có số, ≥2 từ |
| `normPhone(v)` | Chuẩn hoá SĐT: `+84` / `84` → `0` |
| `checkPhone(phone)` | Kiểm tra SĐT: 10 số, bắt đầu bằng `0` |

> ⚠️ **Quan trọng:** Khi thay đổi quy tắc, phải cập nhật cả `validation.gs` để đồng bộ.

#### `modules/api.js` – Giao Tiếp Backend
Tất cả `fetch` tới Apps Script Web App đi qua đây.

| Export | Mô tả |
|--------|-------|
| `fetchSchools(attempt?)` | GET `?api=schools` – tự retry 2 lần |
| `submitForm(payload)` | POST form xác thực đơn vị |
| `callSessionApi(body, token)` | POST có session token (action: list / file) |

Dùng `Content-Type: text/plain` để tránh CORS preflight với Apps Script.

#### `modules/combobox.js` – Combobox Tìm Trường

| Export | Mô tả |
|--------|-------|
| `initCombobox()` | Đăng ký event listeners, trả về `{ loadSchools, getSelected, setSelected }` |
| `loadSchools(arr)` | Nạp danh sách, tính sẵn chuỗi `.f` (đã fold) |
| `getSelected()` | Trả về `{ c, g, n }` hoặc `null` |

Tính năng:
- Tìm kiếm theo nhiều từ (AND logic)
- Keyboard: `↑ ↓` điều hướng, `Enter` chọn, `Esc` đóng
- Mobile: panel full-screen; Desktop ≥700px: dropdown

#### `modules/document-viewer.js` – Trình Xem Tài Liệu

| Export | Mô tả |
|--------|-------|
| `showDocumentViewer(r, onLogout)` | Khởi tạo màn hình xem sau đăng nhập thành công |

Luồng nội bộ:
```
showDocumentViewer()
  ├─ Render card + đồng hồ đếm ngược
  ├─ openFolder(null)        → GET danh sách root
  │    └─ renderItems()      → render thư mục + file
  │         ├─ [data-f]      → openFolder(id)  (đệ quy)
  │         └─ [data-file]   → loadFile(id)
  │              └─ Blob URL → nút Mở / Tải về
  ├─ renderCrumbs()          → breadcrumb điều hướng
  ├─ tick()                  → đếm ngược mỗi giây
  └─ logout() / expired()    → thu hồi Blob URL, gọi onLogout
```

---

### ⚙️ Apps Script – `apps-script/`

#### `appsscript.json` – Manifest
```json
{
  "timeZone": "Asia/Ho_Chi_Minh",
  "runtimeVersion": "V8",
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}
```

#### `modules/config.gs` – Hằng Số ★
**Chỉ sửa file này** khi cần thay đổi cấu hình.

| Nhóm | Hằng số chính |
|------|---------------|
| Nội dung | `EVENT_TITLE`, `EVENT_SUBTITLE`, `ORG_CONTACT`, `PRIVACY_NOTE` |
| URL | `FORM_PAGE_URL` (Netlify) |
| Sheet | `SHEET_SCHOOLS`, `SHEET_LOG`, `SHEET_STATS`, `SHEET_TEACHERS` |
| Phiên | `SESSION_SECONDS` (21600 = 6h), `MAX_FILE_BYTES` (25MB) |
| Rate limit | `RATE_WINDOW_SECONDS`, `RATE_MAX_PER_NAME/DEVICE`, `MIN_FILL_MS` |
| Cache | `CACHE_KEY`, `CACHE_SECONDS` (300 = 5 phút) |

#### `modules/utils.gs` – Tiện Ích Server

| Hàm | Mô tả |
|-----|-------|
| `fold_(s)` | Bỏ dấu tiếng Việt, chuyển thường |
| `clean_(v, maxLen)` | Làm sạch chuỗi nhập vào |
| `safeJson_(o)` | JSON an toàn nhúng vào `<script>` |
| `hash_(s)` | MD5 → Base64 URL-safe (ẩn khoá cache) |
| `json_(o)` | Tạo JSON response cho Web App |
| `safeCell_(v)` | Chặn công thức trong Sheet (`=`, `+`, `-`, `@`) |
| `requireSheetUi_()` | Chặn gọi từ ngoài menu Sheet |
| `getSpreadsheet_()` | Lấy Spreadsheet (ưu tiên property → fallback active) |

#### `modules/validation.gs` – Kiểm Tra Dữ Liệu Server

| Hàm | Mô tả |
|-----|-------|
| `checkName_(n)` | Kiểm tra họ tên (mirror `validation.js`) |
| `normPhone_(v)` | Chuẩn hoá SĐT (xử lý thêm Sheet bỏ số 0 đầu) |
| `checkPhone_(p)` | Kiểm tra SĐT |
| `maskPhone_(p)` | Che SĐT trước khi ghi log: `091****678` |
| `normCode_(v)` | `"5"` → `"05"` |
| `isValidLink_(url)` | Kiểm tra URL hợp lệ (`https://`) |
| `folderIdFromLink_(url)` | Trích folder ID từ URL Drive |

#### `modules/school-data.gs` – Danh Sách Trường

| Hàm | Phạm vi | Mô tả |
|-----|---------|-------|
| `getSchools_()` | Server only | Danh sách đầy đủ (có link), cache 5 phút |
| `getPublicSchools_()` | Public | Chỉ trường Hoạt động, **không có link** |
| `readSchoolsFromSheet_()` | Server only | Đọc thô từ Sheet, bỏ dòng trùng mã |
| `invalidateSchoolCache_()` | Internal | Xoá cache ngay lập tức |

#### `modules/teacher-auth.gs` – Xác Thực & Phiên

| Hàm | Mô tả |
|-----|-------|
| `getTeacherIndex_()` | Cache index `{mã|sdt: [tên_fold]}` |
| `isTeacherOf_(code, name, phone)` | Kiểm tra khớp giáo viên |
| `createSession_(info)` | Tạo token 64 ký tự hex, lưu CacheService |
| `loadSession_(token)` | Tải phiên, trả `null` nếu hết hạn |
| `saveSession_(token, sess)` | Gia hạn phiên + cập nhật allowlist |

#### `modules/rate-limit.gs` – Chống Spam

| Hàm | Mô tả |
|-----|-------|
| `checkRateLimit_(items)` | Kiểm tra **và tăng** bộ đếm (atomic với LockService) |
| `peekRateLimit_(items)` | Chỉ kiểm tra, **không tăng** |

#### `modules/drive-api.gs` – API Drive

| Hàm | Mô tả |
|-----|-------|
| `apiList_(p)` | POST `{action:'list'}` → thư mục con + file (tối đa 300 + 500) |
| `apiFile_(p)` | POST `{action:'file'}` → nội dung file base64 |

Bảo mật: chỉ truy cập ID đã có trong `sess.allow` · shortcut bị loại · Docs/Sheets/Slides xuất PDF · file >25MB bị từ chối.

#### `modules/web-app.gs` – Entry Point GAS ★

| Hàm | Mô tả |
|-----|-------|
| `doGet(e)` | Phục vụ HTML / JSON danh sách trường |
| `doPost(e)` | Routing: `list` → `apiList_()`, `file` → `apiFile_()`, mặc định → `submitForm_()` |
| `submitForm_(p)` | Honeypot → validate → rate limit → xác thực giáo viên → tạo phiên |

#### `modules/sheet-setup.gs` – Quản Trị Sheet

| Hàm | Mô tả |
|-----|-------|
| `onOpen()` | Tạo menu "🔗 QR Trường" |
| `onEdit(e)` | Xoá cache khi sửa tab trường/giáo viên |
| `setup()` | Khởi tạo đầy đủ: tạo tab, format cột, data validation |
| `writeLog_(values)` | Ghi nhật ký lượt gửi form |
| `validateSchoolList()` | Báo cáo lỗi dữ liệu tab DanhSachTruong |
| `validateTeacherList()` | Báo cáo lỗi dữ liệu tab DanhSachGiaoVien |
| `refreshStats()` / `buildStats_()` | Cập nhật tab ThongKe (theo cụm + theo trường) |
| `installStatsTrigger()` | Cài trigger tự động 10 phút/lần |

#### `DongBoDrive.gs` – Đồng Bộ Từ Drive

| Hàm | Mô tả |
|-----|-------|
| `syncSchoolsFromDrive()` | Đọc cấu trúc thư mục Drive → cập nhật tab DanhSachTruong |

```
Thư mục gốc (DRIVE_ROOT_FOLDER_ID)
  ├─ "Cụm 1 - ..."  →  "01 - Tên trường A",  "02 - Tên trường B"
  └─ "Cụm 2 - ..."  →  "16 - ...", ...
```

---

## Luồng dữ liệu tổng quan

```
[Người dùng quét QR]
        │
        ▼
  index.html
        │  GET ?api=schools
        ├──────────────────► Apps Script ──► Google Sheet (DanhSachTruong)
        │  ◄── { schools[], config }
        │
        │  [Điền form + Gửi]
        │  POST { fullName, phone, schoolCode }
        ├──────────────────► Apps Script
        │                       ├─ Kiểm tra DanhSachGiaoVien
        │                       ├─ Rate limit (CacheService)
        │                       ├─ Ghi NhatKy
        │                       └─ Tạo session token
        │  ◄── { status:'ok', token }
        │
        │  [Bấm thư mục]
        │  POST { action:'list', token }
        ├──────────────────► Apps Script ──► Google Drive
        │  ◄── { folders[], files[] }
        │
        │  [Bấm Xem file]
        │  POST { action:'file', token, fileId }
        ├──────────────────► Apps Script ──► Google Drive
        │  ◄── { data: base64 }
        │
  Hiện file qua Blob URL (không lộ link Drive)
```

---

## Quy ước đặt tên

| Loại | Quy ước | Ví dụ |
|------|---------|-------|
| Hàm private (GAS) | `camelCase_` (kết thúc `_`) | `getSchools_()` |
| Hàm public (GAS) | `camelCase` | `doGet()`, `setup()` |
| Hằng (GAS) | `UPPER_SNAKE_CASE` | `CONFIG`, `LOG_STATUS` |
| ES Module export | `camelCase` | `fetchSchools()`, `initCombobox()` |
| CSS class | `kebab-case` | `.combo-btn`, `.docs-head` |
| CSS variable | `--color-*` / `--*` | `--color-primary`, `--radius` |

---

## Hướng dẫn chỉnh sửa nhanh

| Muốn thay đổi | Sửa file |
|---------------|----------|
| Màu sắc / bo góc / shadow | `src/css/variables.css` |
| Tiêu đề / phụ đề / ghi chú riêng tư | `apps-script/modules/config.gs` → `CONFIG` |
| URL Netlify deploy | `apps-script/modules/config.gs` → `FORM_PAGE_URL` |
| Giới hạn phiên / dung lượng file | `apps-script/modules/config.gs` → `SESSION_SECONDS`, `MAX_FILE_BYTES` |
| Quy tắc kiểm tra họ tên / SĐT | `src/js/modules/validation.js` **và** `apps-script/modules/validation.gs` |
| URL endpoint Apps Script | `src/js/modules/api.js` → `API_URL` |
| Thư mục Drive gốc để đồng bộ | `apps-script/DongBoDrive.gs` → `DRIVE_ROOT_FOLDER_ID` |

---

*Cập nhật lần cuối: 11/2026*

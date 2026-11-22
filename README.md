# QR hồ sơ thiết bị – mã nguồn MỚI NHẤT (bản 22/11/2026)

**Trang web giáo viên dùng là `index.html` ở thư mục gốc gói này** (form: Họ tên + Số điện thoại + Trường, logo SGM, xem tài liệu ngay trên trang). Mở file này bằng trình duyệt là thấy giao diện đang chạy thật.

## Cách hệ thống chạy
1. Giáo viên quét QR → mở trang `index.html` (đang đặt trên Netlify: https://heartfelt-brioche-d58fc5.netlify.app/, QR có thể kèm `?ma=NN` để chọn sẵn trường).
2. Nhập Họ tên + Số điện thoại + Trường → trang gửi lên Google Apps Script (`apps-script/Code.gs`, web app deploy "Anyone").
3. Script so với tab `DanhSachGiaoVien` trong Google Sheet (Mã trường | Họ và tên | Số điện thoại | Trạng thái | Ghi chú). Khớp đúng trường mới cấp phiên xem; không bao giờ trả link Drive.
4. Trang hiển thị thư mục/tệp của đúng trường đó qua API `list` / `file` của script. Không giới hạn thời gian xem; phiên chỉ hết khi để yên quá 6 tiếng.
5. Mọi lần gửi được ghi vào tab `NhatKy` (SĐT được che bớt số).

## Các file
- `apps-script/Code.gs` – máy chủ: kiểm tra dữ liệu, phân quyền, phiên xem, đọc Drive, ghi nhật ký, menu trong Sheet. Cấu hình ở `CONFIG` đầu file (`FORM_PAGE_URL`, `ORG_CONTACT`, giới hạn…).
- `apps-script/DongBoDrive.gs` – menu đồng bộ danh sách trường từ thư mục Drive gốc (`DRIVE_ROOT_FOLDER_ID`).
- `apps-script/appsscript.json` – manifest.
- `index.html` – trang web giáo viên dùng (một file duy nhất, có biến URL web app Apps Script bên trong).
- `logo/` – logo SGM vẽ lại dạng SVG và PNG 512px.
- `DanhSachTruong.csv` – 62 trường (mã, cụm, tên, link thư mục Drive).
- `QR_ho_so_truong.png`, `link_web_app.txt` – mã QR và link.

## Triển khai lại
- Sửa `Code.gs` → trong Apps Script: Deploy → Manage deployments → bút chì → Version: New version → Deploy (giữ nguyên URL /exec).
- Sửa `index.html` → kéo thả file lên trang Deploys của site Netlify (giữ nguyên tên site để QR đã in vẫn chạy).

Không kèm trong gói: danh sách giáo viên/hiệu trưởng (tên, SĐT), file Excel, nhật ký NhatKy – đó là dữ liệu cá nhân, lấy trực tiếp trong Google Sheet nếu được cấp quyền.


Ghi chú: gói này đã bỏ trang `index.html` cũ của Apps Script (form có ô Chức vụ) và file HUONG_DAN.md cũ để tránh nhầm. Code.gs chỉ dùng trang cũ đó nếu `CONFIG.FORM_PAGE_URL` để trống; hiện đang trỏ sang trang Netlify nên không cần.

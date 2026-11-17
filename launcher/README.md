# CarDash – launcher cho màn hình Android ô tô

Màn hình chính kiểu bảng điều khiển xe: thanh bên ghim app, trang tổng quan (đồng hồ + lịch âm, điều khiển nhạc, 4 lối tắt) và lưới toàn bộ ứng dụng. Dùng cá nhân, không phụ thuộc thư viện ngoài.

## Lấy file APK
Mỗi lần đẩy code vào thư mục `launcher/`, GitHub Actions tự build. Vào tab **Actions** → **Build CarDash APK** → lần chạy mới nhất → tải mục **CarDash-apk** (file zip chứa APK).

Mọi bản build ký cùng một khoá (`keystore/cardash.jks`) nên cài bản mới đè lên bản cũ được.

## Cách dùng
- **Nút ở cuối thanh bên**: chuyển giữa trang tổng quan và lưới ứng dụng; nhấn giữ để mở Cài đặt.
- **Nhấn giữ một app trong lưới**: ghim vào thanh bên, đặt làm lối tắt, ẩn, xem thông tin, gỡ cài đặt.
- **Ô có dấu +**: chạm để chọn app; nhấn giữ ô đã có app để đổi hoặc bỏ.
- **Thẻ nhạc**: nút lùi/phát/tới dùng được ngay; muốn hiện tên bài và ảnh bìa thì chạm vào thẻ để cấp quyền truy cập thông báo.

## Build trên máy
Cần JDK 17 và Android SDK (platform 34): `./gradlew assembleRelease`, APK nằm ở `app/build/outputs/apk/release/`.

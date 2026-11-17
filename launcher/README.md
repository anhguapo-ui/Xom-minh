# CarDash – launcher cho màn hình Android ô tô

Màn hình chính kiểu bảng điều khiển xe, ưu tiên màn dọc: bản đồ nền tối có chấm vị trí và tốc độ GPS, thẻ "Hôm nay" (thời tiết, ngày, lịch âm), thẻ nhạc, thanh dock ghim 8 app và lưới toàn bộ ứng dụng. Dùng cá nhân, không phụ thuộc thư viện ngoài.

Bản đồ dùng ô ảnh OpenStreetMap, thời tiết dùng Open-Meteo; cả hai miễn phí, không cần khoá, cần có mạng.

## Lấy file APK
Link tải trực tiếp bản mới nhất: https://github.com/anhguapo-ui/Xom-minh/releases/download/cardash-latest/CarDash.apk

Mỗi lần đẩy code vào thư mục `launcher/`, GitHub Actions tự build và cập nhật file ở link trên. Mọi bản build ký cùng một khoá (`keystore/cardash.jks`) nên cài bản mới đè lên bản cũ được.

## Cách dùng
- **Bản đồ**: kéo để xem chỗ khác, nút +/− để phóng, chạm để mở Google Maps. Dòng chuyến đi (phút · km) chỉ tính khi CarDash đang hiện; nhấn giữ để đặt lại.
- **YouTube**: nút đỏ cạnh ô tìm kiếm đổi khung bản đồ thành YouTube; nút X ở dải bên trái để về bản đồ (video vẫn chạy tiếp), rời launcher thì video tạm dừng.
- **Nút lưới ở đầu dock**: chuyển giữa trang tổng quan và lưới ứng dụng; nhấn giữ để mở Cài đặt.
- **Nhấn giữ một app trong lưới**: ghim vào dock, ẩn, xem thông tin, gỡ cài đặt.
- **Ô có dấu +**: chạm để chọn app; nhấn giữ ô đã có app để đổi hoặc bỏ.
- **Cài đặt**: chọn ảnh nền, màu nhấn, bản đồ xoay theo hướng xe hay giữ hướng Bắc, và chỉnh lề trên/dưới nếu thanh điều khiển của xe che mất nội dung.
- **Thẻ nhạc**: nút lùi/phát/tới dùng được ngay; muốn hiện tên bài và ảnh bìa thì chạm vào thẻ để cấp quyền truy cập thông báo.

## Build trên máy
Cần JDK 17 và Android SDK (platform 34): `./gradlew assembleRelease`, APK nằm ở `app/build/outputs/apk/release/`.

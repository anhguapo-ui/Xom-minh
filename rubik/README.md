# Rubik Bé – app giải khối Rubik cho trẻ em

Bé nhập màu khối Rubik (quét bằng camera hoặc chạm tô màu), app chỉ từng bước xoay trên khối 3D có mũi tên và lời đọc tiếng Việt.

- **Giải nhanh**: khoảng 20–22 bước (thuật toán hai pha Kociemba).
- **Học giải**: cách giải từng tầng cho người mới (dấu cộng trắng → góc trắng → tầng giữa → dấu cộng vàng → mặt vàng → góc vàng → cạnh vàng), có giải thích và công thức.

Cầm khối: ô giữa **vàng ở trên**, ô giữa **xanh lá quay về phía mình**.

## Tải APK
Link tải trực tiếp bản mới nhất: https://github.com/anhguapo-ui/Xom-minh/releases/download/rubik-latest/RubikBe.apk

Mỗi lần đẩy code vào thư mục `rubik/`, GitHub Actions tự build, chụp ảnh màn hình (Robolectric) và cập nhật file ở link trên.

## Build trên máy
Cần JDK 17 và Android SDK (platform 34): `./gradlew assembleRelease`.

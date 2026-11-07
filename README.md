# Xóm Mình

Ứng dụng cho vòng tròn bạn bè và các gia đình: điểm danh, rủ kèo, xung phong đăng cai, chat, Miếu Thần Tài (thắp hương, xin xăm, thầy bói).

- Bản thật: https://xom-minh.netlify.app (React + TypeScript + Vite, dữ liệu trên Supabase)
- Bản demo một trang: https://xom-minh.netlify.app/demo/ (`public/demo/index.html`, dữ liệu lưu trên máy người dùng)

## Chạy trên máy

```bash
npm install
npm run dev
```

## Cơ sở dữ liệu

Các file trong `supabase/migrations/` được dán lần lượt vào Supabase → SQL Editor → Run.
Mọi quyền đọc/ghi do RLS quyết định: người ngoài xóm không xem được gì.

## Lộ trình

1. Nền móng: đăng nhập, xóm, gia đình, link mời, hồ sơ, chibi ← đang làm
2. Điểm danh, kèo, đăng cai, chat
3. Miếu Thần Tài, xin xăm, thầy bói
4. Thông báo trên điện thoại

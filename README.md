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

Dán lần lượt vào Supabase → SQL Editor → Run:

1. `supabase/migrations/0001_nen_mong.sql`
2. `supabase/migrations/0002_link_rieng.sql`
3. `supabase/chay_mot_lan_gd2_gd3_gd4.sql` (gộp sẵn 0003, 0004, 0005)
4. `supabase/migrations/0006_album_tuong_tro_ai.sql`

Mọi quyền đọc/ghi do RLS quyết định: người ngoài xóm không xem được gì.

## Thông báo đẩy

- `netlify/functions/notify.mts` (`/api/notify`): gửi thông báo cho cả xóm, cần đăng nhập.
- `netlify/functions/vapid.mts` (`/api/vapid`): khoá công khai; cặp khoá do máy chủ tự tạo và cất trong Netlify Blobs.
- `netlify/functions/remind.mts`: nhắc 19:00 hằng ngày (mùng 1, rằm, vía Thần Tài, sinh nhật, ngày cưới).
  Cần biến môi trường `SUPABASE_SERVICE_ROLE_KEY` trên Netlify (dán trong Netlify, không đưa vào code).

## AI (OpenAI)

- `netlify/functions/thay-ai.mts` (`/api/thay-ai`): trò chuyện với Thầy Lộc, 100 câu/người/ngày.
- `netlify/functions/chibi-ai.mts` (`/api/chibi-ai`): AI chọn kiểu chibi từ ảnh; AI vẽ chân dung chibi (20 lần/người/tháng),
  phần vẽ chạy nền ở `chibi-draw-background.mts`.
- Cần biến môi trường `OPENAI_API_KEY` trên Netlify. Tuỳ chọn: `OPENAI_CHAT_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`.

## Các phần của app

1. Nền móng: đăng nhập, xóm, gia đình, link mời riêng, hồ sơ, chibi
2. Điểm danh, kèo, đăng cai, chat, bình chọn, tin ghim
3. Miếu Thần Tài, xin xăm, thầy bói
4. Cài app và thông báo đẩy
5. Album ảnh, Góc tương trợ, sân miếu 3D, Thầy Lộc AI, Chibi AI

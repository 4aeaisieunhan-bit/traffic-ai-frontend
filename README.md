# Traffic AI — Frontend

Giao diện web (Angular 22, zoneless, signals) cho hệ thống phát hiện vi phạm giao thông từ video camera.
Backend FastAPI ở repo `traffic-ai-backend`.

## Chạy trên máy

```bash
npm install
npm start            # http://localhost:4200, gọi backend tại http://localhost:8000 (src/environments/environment.ts)
npm test             # Vitest
npm run build        # bản production vào dist/
```

Backend phải đang chạy (`python server.py`). Backend cho phép mọi cổng trên `localhost` / `127.0.0.1`. Địa chỉ khác
(IP mạng LAN, tên miền) thêm vào `CORS_ORIGINS` trong `.env` của backend.

Tài khoản tự đăng ký phải được quản trị viên kích hoạt ở trang **Tài khoản** (`/admin/users`) trước khi đăng nhập.

## Triển khai lên Vercel

`vercel.json` chạy `npm run build:vercel`. Script `scripts/set-env.mjs` ghi `environment.prod.ts` từ biến môi trường:

- `API_URL`: địa chỉ HTTPS của backend (VD: `https://abc.trycloudflare.com`, không có `/` cuối).

Ở backend đặt `CORS_ORIGINS=https://<du-an>.vercel.app` và `CROSS_SITE_COOKIE=1`.

Khi frontend và backend khác tên miền, cookie dùng để tải ảnh / video bằng chứng là cookie phân vùng (*Partitioned*).
Cookie này chỉ được gửi khi trang đang mở là frontend. Vì vậy:

- `<img>`, `<video>` trong trang dùng URL trực tiếp tới backend.
- Mở ảnh ở tab mới / tải về phải đi qua `MediaService` (tải bằng token rồi mở bản blob), không dùng link thẳng.
- Video kết quả ở trang Lịch sử phát trong hộp thoại ngay trên trang.

## Cấu trúc `src/app`

| Thư mục | Nội dung |
|---|---|
| `core/services` | Gọi API: auth, analyze, violation, location, statistics, system (trạng thái + thông báo), user-admin, media |
| `core/services/analysis-session.service.ts` | Phiên phân tích ở cấp ứng dụng: chuyển trang không mất tiến độ, F5 thì hỏi backend để hiện lại |
| `core/interceptors` | Gắn `Authorization: Bearer` cho API và file `/static/...`; 401 thì về trang đăng nhập |
| `core/guards` | `authGuard`, `adminGuard`, `guestGuard` |
| `hompage`, `auth` | Trang chủ, đăng nhập, đăng ký |
| `layout` | Header (đồng hồ, trạng thái máy phân tích, thông báo) + sidebar |
| `dashboard`, `video-analysis`, `history` | Tổng quan, tải video lên và theo dõi phân tích, lịch sử các lần phân tích |
| `violations` | Danh sách (lọc, xuất Excel/PDF) và chi tiết hồ sơ (duyệt / từ chối) |
| `statistics`, `locations`, `account`, `users` | Thống kê, địa điểm, đổi mật khẩu, quản lý tài khoản (admin) |

Giao diện theo hệ thống thiết kế trong `src/styles.css` (token màu ở `:root`).

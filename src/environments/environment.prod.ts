// Cấu hình bản production.
// Khi deploy lên Vercel, file này được GHI ĐÈ lúc build bởi scripts/set-env.mjs từ biến môi trường API_URL
// (địa chỉ backend, VD: https://abc.trycloudflare.com). Giá trị dưới đây chỉ dùng khi frontend và backend
// được phục vụ chung một tên miền.
export const environment = {
  production: true,
  apiUrl: '/api/v1',
  staticUrl: '',
};

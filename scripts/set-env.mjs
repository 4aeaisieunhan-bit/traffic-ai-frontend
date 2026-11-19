// Ghi src/environments/environment.prod.ts từ biến môi trường API_URL trước khi build production.
// Dùng trên Vercel: đặt API_URL = địa chỉ backend (VD: https://abc.trycloudflare.com), không có "/" cuối.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raw = (process.env.API_URL || '').trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '');
if (!raw) {
  console.error('\n❌ Thiếu biến môi trường API_URL (địa chỉ backend, VD: https://abc.trycloudflare.com).');
  console.error('   Vercel: Project → Settings → Environment Variables → thêm API_URL, rồi Redeploy.\n');
  process.exit(1);
}
if (!/^https:\/\//.test(raw) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(raw)) {
  console.error(`\n❌ API_URL phải là địa chỉ HTTPS (trình duyệt chặn gọi HTTP từ trang HTTPS): ${raw}\n`);
  process.exit(1);
}

const out = fileURLToPath(new URL('../src/environments/environment.prod.ts', import.meta.url));
writeFileSync(out, `// File sinh tự động bởi scripts/set-env.mjs lúc build — không sửa tay.
export const environment = {
  production: true,
  apiUrl: '${raw}/api/v1',
  staticUrl: '${raw}',
};
`);
console.log(`✅ Backend cho bản production: ${raw}`);

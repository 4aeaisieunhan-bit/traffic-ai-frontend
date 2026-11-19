// Gắn "Authorization: Bearer <token>" vào mọi request tới backend.
// Server trả 401 (token hết hạn / bị thu hồi) -> xóa phiên và chuyển về trang đăng nhập.
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.services';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isApi = req.url.startsWith(environment.apiUrl);
  const token = auth.getToken();
  // withCredentials: để trình duyệt nhận / gửi cookie HttpOnly dùng cho ảnh bằng chứng & video (<img>, <video>)
  const authReq = isApi
    ? req.clone({ withCredentials: true, ...(token ? { setHeaders: { Authorization: `Bearer ${token}` } } : {}) })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // Sai mật khẩu khi đăng nhập cũng là 401 -> để trang login tự hiển thị lỗi
      const isAuthEndpoint = req.url.startsWith(`${environment.apiUrl}/auth/login`);
      if (isApi && err.status === 401 && !isAuthEndpoint) {
        auth.clearSession();
        router.navigate(['/login'], { queryParams: { expired: 1, returnUrl: router.url } });
      }
      return throwError(() => err);
    }),
  );
};

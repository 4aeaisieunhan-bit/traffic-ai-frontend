import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.services';

/** Trang /admin/**: bắt buộc đăng nhập. Tải lại trang -> kiểm tra token đã lưu qua /auth/me. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.restoreSession().pipe(
    map((ok) => ok || router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })),
  );
};

/** Trang chỉ dành cho quản trị viên (đặt sau authGuard). Cán bộ thường -> về dashboard. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.restoreSession().pipe(
    map((ok) => (ok && auth.isAdmin() ? true : router.createUrlTree(['/admin/dashboard']))),
  );
};

/** Trang /login, /register: đã đăng nhập thì chuyển thẳng vào hệ thống. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.restoreSession().pipe(map((ok) => (ok ? router.createUrlTree(['/admin/dashboard']) : true)));
};

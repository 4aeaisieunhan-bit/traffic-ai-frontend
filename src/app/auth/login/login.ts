import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.services';
import { apiErrorMessage } from '../../core/services/location.service';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);

  email = '';
  password = '';
  remember = false;
  showPassword = false;
  showForgot = false;

  // Signal để giao diện cập nhật ngay (app chạy zoneless)
  loading = signal(false);
  errorMessage = signal('');
  infoMessage = signal('');

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('registered')) {
      this.email = q.get('email') ?? '';
      this.infoMessage.set('Đăng ký thành công! Vui lòng đăng nhập.');
    } else if (q.get('expired')) {
      this.infoMessage.set('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    } else if (q.get('loggedOut')) {
      this.infoMessage.set('Bạn đã đăng xuất.');
    }
  }

  login(): void {
    if (this.loading()) return;
    this.errorMessage.set('');
    if (!this.email.trim() || !this.password) {
      this.errorMessage.set('Vui lòng nhập đầy đủ email và mật khẩu');
      return;
    }

    this.loading.set(true);
    this.authService.login(this.email.trim(), this.password, this.remember).subscribe({
      next: () => {
        this.loading.set(false);
        // Quay lại trang đang xem trước khi bị yêu cầu đăng nhập (chỉ cho phép đường dẫn nội bộ)
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        const target = returnUrl && returnUrl.startsWith('/admin') ? returnUrl : '/admin/dashboard';
        this.router.navigateByUrl(target);
      },
      error: (err) => {
        this.loading.set(false);
        this.password = '';
        this.errorMessage.set(apiErrorMessage(err, 'Đăng nhập thất bại'));
      },
    });
  }
}

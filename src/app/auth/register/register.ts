import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.services';
import { apiErrorMessage } from '../../core/services/location.service';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 6;

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-register',
  styleUrl: './register.css',
  templateUrl: './register.html',
})
export class Register {
  private router = inject(Router);
  private authService = inject(AuthService);

  readonly minPassword = MIN_PASSWORD;

  fullName = '';
  email = '';
  password = '';
  confirmPassword = '';
  showPassword = false;

  loading = signal(false);
  errorMessage = signal('');

  /** Kiểm tra phía client (backend vẫn kiểm tra lại). Trả về lỗi đầu tiên hoặc ''. */
  private validate(): string {
    if (!this.fullName.trim() || !this.email.trim() || !this.password || !this.confirmPassword) {
      return 'Vui lòng nhập đầy đủ thông tin';
    }
    if (!EMAIL_RE.test(this.email.trim())) return 'Email không hợp lệ';
    if (this.password.length < MIN_PASSWORD) return `Mật khẩu phải có ít nhất ${MIN_PASSWORD} ký tự`;
    if (this.password !== this.confirmPassword) return 'Mật khẩu và xác nhận mật khẩu không khớp';
    return '';
  }

  register(): void {
    if (this.loading()) return;
    const error = this.validate();
    this.errorMessage.set(error);
    if (error) return;

    this.loading.set(true);
    const email = this.email.trim().toLowerCase();
    this.authService.register(this.fullName.trim(), email, this.password).subscribe({
      next: (user) => {
        this.loading.set(false);
        // Mặc định tài khoản mới phải được quản trị viên kích hoạt rồi mới đăng nhập được
        const queryParams = user.is_active ? { registered: 1, email } : { registered: 1, pending: 1, email };
        this.router.navigate(['/login'], { queryParams });
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(apiErrorMessage(err, 'Đăng ký thất bại'));
      },
    });
  }
}

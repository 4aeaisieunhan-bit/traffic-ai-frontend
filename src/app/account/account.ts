import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/services/auth.services';
import { apiErrorMessage } from '../core/services/location.service';
import { ROLE_LABELS } from '../core/models/user.model';

const MIN_PASSWORD = 6;

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './account.html',
  // Dùng chung giao diện panel / form với trang Địa điểm
  styleUrl: '../locations/locations.css',
})
export class Account {
  private auth = inject(AuthService);

  readonly user = this.auth.currentUser;
  readonly roleLabels = ROLE_LABELS;
  readonly minPassword = MIN_PASSWORD;

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  showPassword = false;

  saving = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  changePassword(): void {
    if (this.saving()) return;
    this.successMessage.set('');
    const error = !this.currentPassword || !this.newPassword || !this.confirmPassword
      ? 'Vui lòng nhập đầy đủ thông tin'
      : this.newPassword.length < MIN_PASSWORD
        ? `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD} ký tự`
        : this.newPassword !== this.confirmPassword
          ? 'Mật khẩu mới và xác nhận không khớp'
          : this.newPassword === this.currentPassword
            ? 'Mật khẩu mới phải khác mật khẩu hiện tại'
            : '';
    this.errorMessage.set(error);
    if (error) return;

    this.saving.set(true);
    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.saving.set(false);
        this.currentPassword = this.newPassword = this.confirmPassword = '';
        this.successMessage.set('Đã đổi mật khẩu. Các thiết bị khác đang đăng nhập tài khoản này đã bị đăng xuất.');
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(apiErrorMessage(err, 'Không đổi được mật khẩu'));
      },
    });
  }
}

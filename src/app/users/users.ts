import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '../core/services/auth.services';
import { AdminUser, UserAdminService } from '../core/services/user-admin.service';
import { apiErrorMessage } from '../core/services/location.service';
import { ROLE_LABELS, UserRole } from '../core/models/user.model';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './users.html',
  // Dùng chung giao diện bảng / panel với trang Địa điểm
  styleUrl: '../locations/locations.css',
})
export class Users implements OnInit {
  private service = inject(UserAdminService);
  private auth = inject(AuthService);
  // App chạy zoneless nên phải báo Angular cập nhật view sau mỗi callback bất đồng bộ
  private cdr = inject(ChangeDetectorRef);

  readonly roleLabels = ROLE_LABELS;
  readonly me = this.auth.currentUser;

  users: AdminUser[] = [];
  loading = true;
  busyId: number | null = null;
  errorMessage = '';
  successMessage = '';
  // Mật khẩu tạm vừa tạo: chỉ hiển thị 1 lần
  resetResult: { email: string; password: string } | null = null;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.service.list().subscribe({
      next: (data) => {
        this.users = data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => this.fail(err, 'Không tải được danh sách tài khoản'),
    });
  }

  isMe(u: AdminUser): boolean {
    return u.id === this.me()?.id;
  }

  toggleActive(u: AdminUser): void {
    const action = u.is_active ? 'Khóa' : 'Kích hoạt';
    if (u.is_active && !confirm(`Khóa tài khoản ${u.email}? Người này sẽ bị đăng xuất khỏi mọi thiết bị.`)) return;
    this.run(u, this.service.update(u.id, { is_active: !u.is_active }), `${action} tài khoản ${u.email} thành công`);
  }

  setRole(u: AdminUser, role: UserRole): void {
    if (role === u.role) return;
    this.run(u, this.service.update(u.id, { role }), `Đã đổi vai trò của ${u.email} thành ${ROLE_LABELS[role]}`);
  }

  resetPassword(u: AdminUser): void {
    if (!confirm(`Đặt lại mật khẩu cho ${u.email}? Mật khẩu cũ sẽ không dùng được nữa và người này bị đăng xuất.`)) return;
    this.clearMessages();
    this.busyId = u.id;
    this.service.resetPassword(u.id).subscribe({
      next: (res) => {
        this.busyId = null;
        this.resetResult = { email: u.email, password: res.temporary_password };
        this.load();
      },
      error: (err) => this.fail(err, 'Không đặt lại được mật khẩu'),
    });
  }

  copyPassword(): void {
    if (this.resetResult) navigator.clipboard?.writeText(this.resetResult.password).catch(() => undefined);
  }

  private run(u: AdminUser, request: ReturnType<UserAdminService['update']>, success: string): void {
    this.clearMessages();
    this.busyId = u.id;
    request.subscribe({
      next: () => {
        this.busyId = null;
        this.successMessage = success;
        this.load();
      },
      error: (err) => this.fail(err, 'Thao tác thất bại'),
    });
  }

  private fail(err: unknown, fallback: string): void {
    this.busyId = null;
    this.loading = false;
    this.errorMessage = apiErrorMessage(err, fallback);
    this.cdr.markForCheck();
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
    this.resetResult = null;
  }
}

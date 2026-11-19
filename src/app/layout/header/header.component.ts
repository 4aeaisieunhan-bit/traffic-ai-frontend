import { ChangeDetectorRef, Component, OnInit, OnDestroy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.services';
import { ROLE_LABELS } from '../../core/models/user.model';
import { SystemNotification, SystemService, relativeTime } from '../../core/services/system.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {
  currentTime: string = '';
  currentDate: string = '';
  showNotifications = false;
  showUserMenu = false;

  // Thông báo + trạng thái lấy từ backend (SystemService hỏi định kỳ 30 s)
  private system = inject(SystemService);
  notifications = this.system.notifications;
  status = this.system.status;
  offline = this.system.offline;
  seenAt = this.system.seenAt;
  statusText = computed(() => {
    if (this.offline()) return 'Mất kết nối máy chủ';
    const s = this.status();
    if (!s) return 'Đang kết nối';
    if (s.ai_state === 'busy') return `Đang phân tích ${s.active_tasks} video`;
    return s.device.type === 'gpu' ? 'Sẵn sàng · GPU' : 'Sẵn sàng · CPU';
  });

  private timer: any;
  private cdr = inject(ChangeDetectorRef);
  private auth = inject(AuthService);
  private router = inject(Router);

  // Người dùng đang đăng nhập (signal -> header tự cập nhật)
  user = this.auth.currentUser;
  userInitial = computed(() => (this.user()?.full_name.trim().split(/\s+/).pop()?.[0] ?? '?').toUpperCase());
  roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABELS[role] : '';
  });
  loggingOut = false;

  logout(): void {
    if (this.loggingOut) return;
    this.loggingOut = true;
    this.showUserMenu = false;
    this.auth.logout().subscribe({
      complete: () => {
        this.loggingOut = false;
        this.router.navigate(['/login'], { queryParams: { loggedOut: 1 } });
      },
    });
  }

  ngOnInit(): void {
    this.updateClock();
    this.timer = setInterval(() => this.updateClock(), 1000);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  updateClock(): void {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('vi-VN', { hour12: false });
    this.currentDate = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    // Zoneless: setInterval không tự kích hoạt change detection
    this.cdr.markForCheck();
  }

  toggleNotifications(): void {
    this.showNotifications = !this.showNotifications;
    this.showUserMenu = false;
  }

  toggleUserMenu(): void {
    this.showUserMenu = !this.showUserMenu;
    this.showNotifications = false;
  }

  get unreadCount(): number {
    return this.system.unreadCount();
  }

  markAllAsRead(): void {
    this.system.markAllRead();
  }

  isUnread(n: SystemNotification): boolean {
    return n.time > this.seenAt();
  }

  timeAgo(n: SystemNotification): string {
    return relativeTime(n.time);
  }

  open(n: SystemNotification): void {
    this.showNotifications = false;
    this.router.navigateByUrl(n.link);
  }
}
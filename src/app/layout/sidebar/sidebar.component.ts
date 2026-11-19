import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.services';
import { SystemService } from '../../core/services/system.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent {
  private auth = inject(AuthService);
  // Mục "Tài khoản" (quản lý người dùng) chỉ hiện với quản trị viên
  isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');

  // Telemetry thật từ backend (SystemService do layout khởi động)
  private system = inject(SystemService);
  status = this.system.status;
  offline = this.system.offline;
  pendingReview = computed(() => this.status()?.pending_review ?? 0);
  deviceLabel = computed(() => {
    const d = this.status()?.device;
    if (!d) return '—';
    return d.name.replace(/^GPU\s+/, '').replace(/NVIDIA GeForce\s+/i, '').replace(/\s+Laptop GPU/i, ' Laptop');
  });
  modelLabel = computed(() => {
    const m = this.status()?.models;
    return m ? `YOLO · ${m.available}/${m.total} mô hình` : '—';
  });
  stateLabel = computed(() => {
    if (this.offline()) return { text: 'Mất kết nối', color: '#e5484d' };
    const s = this.status();
    if (!s) return { text: 'Đang kết nối', color: '#7d828f' };
    if (s.ai_state === 'busy') return { text: `Đang phân tích ${s.active_tasks}`, color: '#e2a336' };
    if (s.ai_state === 'degraded') return { text: 'Thiếu mô hình', color: '#e2a336' };
    return { text: 'Sẵn sàng', color: '#4cc38a' };
  });
  fpsLabel = computed(() => {
    const f = this.status()?.last_processing_fps;
    return f != null ? `${f.toFixed(1)} FPS` : 'Chưa có dữ liệu';
  });
}

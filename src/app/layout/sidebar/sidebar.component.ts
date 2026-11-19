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
    if (this.offline()) return { text: 'MẤT KẾT NỐI', color: '#fb7185' };
    const s = this.status();
    if (!s) return { text: 'ĐANG KẾT NỐI...', color: '#94a3b8' };
    if (s.ai_state === 'busy') return { text: `ĐANG PHÂN TÍCH (${s.active_tasks})`, color: '#60a5fa' };
    if (s.ai_state === 'degraded') return { text: 'THIẾU MÔ HÌNH', color: '#fbbf24' };
    return { text: 'AI SẴN SÀNG', color: '#00e650' };
  });
  fpsLabel = computed(() => {
    const f = this.status()?.last_processing_fps;
    return f != null ? `${f.toFixed(1)} FPS` : 'Chưa có dữ liệu';
  });
}

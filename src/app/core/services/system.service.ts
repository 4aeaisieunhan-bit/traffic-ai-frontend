// src/app/core/services/system.service.ts
// Trạng thái hệ thống + thông báo THẬT từ backend (thay cho số liệu giả trên header / sidebar).
// Dùng chung cho header và sidebar: chỉ 1 vòng hỏi backend (30 s), tạm dừng khi tab bị ẩn.
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SystemStatus {
  online: boolean;
  server_time: string;
  database: string;
  device: { name: string; type: 'gpu' | 'cpu' | 'unknown'; fp16: boolean };
  models: { total: number; available: number; items: { key: string; name: string; weight: string; available: boolean }[] };
  ai_state: 'ready' | 'busy' | 'degraded';
  active_tasks: number;
  last_processing_fps: number | null;
  last_task_finished_at: string | null;
  pending_review: number;
}

export interface SystemNotification {
  id: string;
  type: 'alert' | 'info' | 'error';
  title: string;
  text: string;
  time: string;     // ISO
  link: string;
}

export interface PublicStats {
  locations: number;
  videos_analyzed: number;
  vehicles_scanned: number;
  violations: number;
  avg_confidence: number | null;
  videos_uploaded: number;
}

const POLL_MS = 30_000;
const SEEN_KEY = 'traffic_ai_notif_seen';

@Injectable({ providedIn: 'root' })
export class SystemService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  /** null = chưa tải lần nào; offline = gọi backend thất bại. */
  readonly status = signal<SystemStatus | null>(null);
  readonly offline = signal(false);
  readonly notifications = signal<SystemNotification[]>([]);
  /** Mốc thời gian người dùng bấm "Đã đọc tất cả" (thông báo mới hơn mốc này = chưa đọc). */
  readonly seenAt = signal<string>(this.readSeen());
  readonly unreadCount = computed(() => this.notifications().filter((n) => n.time > this.seenAt()).length);

  private timer: ReturnType<typeof setInterval> | null = null;
  private users = 0;
  private readonly onVisibility = () => { if (!document.hidden) this.refresh(); };

  /** Bắt đầu theo dõi (gọi từ layout trang quản trị). Đếm số nơi đang dùng để dừng đúng lúc. */
  start(): void {
    if (++this.users > 1) return;
    this.refresh();
    this.timer = setInterval(() => { if (!document.hidden) this.refresh(); }, POLL_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    if (--this.users > 0) return;
    this.users = 0;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  refresh(): void {
    forkJoin({
      status: this.http.get<SystemStatus>(`${this.api}/system/status`).pipe(catchError(() => of(null))),
      notif: this.http.get<{ items: SystemNotification[] }>(`${this.api}/system/notifications`).pipe(catchError(() => of(null))),
    }).subscribe(({ status, notif }) => {
      this.offline.set(status === null);
      if (status) this.status.set(status);
      if (notif) this.notifications.set(notif.items);
    });
  }

  markAllRead(): void {
    const newest = this.notifications()[0]?.time ?? new Date().toISOString().slice(0, 19);
    this.seenAt.set(newest);
    try { localStorage.setItem(SEEN_KEY, newest); } catch { /* storage bị chặn */ }
  }

  /** Số liệu tổng hợp cho trang chủ (không cần đăng nhập). */
  publicStats(): Observable<PublicStats> {
    return this.http.get<PublicStats>(`${this.api}/public/stats`);
  }

  private readSeen(): string {
    try { return localStorage.getItem(SEEN_KEY) ?? ''; } catch { return ''; }
  }
}

/** '2026-11-13T10:20:00' -> 'vừa xong' / '5 phút trước' / '3 giờ trước' / '12/11/2026'. */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} ngày trước`;
  return new Date(t).toLocaleDateString('vi-VN');
}

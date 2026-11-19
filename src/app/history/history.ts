// Lịch sử các lần phân tích video: theo dõi tiến độ, xem kết quả, huỷ lần đang chạy, xoá (quản trị viên).
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AnalysisTaskSummary, AnalyzeService } from '../core/services/analyze.service';
import { AuthService } from '../core/services/auth.services';
import { apiErrorMessage } from '../core/services/location.service';
import { environment } from '../../environments/environment';

const PAGE_SIZE = 20;
const LIVE_REFRESH_MS = 5000;

export const TASK_STATUS_LABELS: Record<AnalysisTaskSummary['status'], string> = {
  pending: 'Đang chờ',
  processing: 'Đang phân tích',
  completed: 'Hoàn tất',
  failed: 'Thất bại',
  cancelled: 'Đã huỷ',
};

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './history.html',
  styleUrl: './history.css',
})
export class History implements OnInit, OnDestroy {
  private analyze = inject(AnalyzeService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  readonly staticUrl = environment.staticUrl;
  readonly labels = TASK_STATUS_LABELS;
  readonly statusOptions: AnalysisTaskSummary['status'][] = ['processing', 'pending', 'completed', 'failed', 'cancelled'];
  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');

  tasks: AnalysisTaskSummary[] = [];
  total = 0;
  page = 0;
  statusFilter = '';
  loading = false;
  errorMessage = '';
  successMessage = '';
  busyId = '';                    // task đang được huỷ / xoá
  playing: AnalysisTaskSummary | null = null;   // lần phân tích đang xem video kết quả

  @HostListener('document:keydown.escape')
  closePlayer(): void { this.playing = null; }

  private sub?: Subscription;
  private timer: ReturnType<typeof setTimeout> | null = null;

  get pageCount(): number { return Math.max(1, Math.ceil(this.total / PAGE_SIZE)); }
  get hasRunning(): boolean { return this.tasks.some((t) => t.status === 'pending' || t.status === 'processing'); }

  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
  }

  load(silent = false): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!silent) { this.loading = true; this.errorMessage = ''; }
    this.sub?.unsubscribe();
    this.sub = this.analyze.listTasks(PAGE_SIZE, this.page * PAGE_SIZE, this.statusFilter).subscribe({
      next: (res) => {
        this.tasks = res.items;
        this.total = res.total;
        this.loading = false;
        // Có lần đang chạy -> tự làm mới tiến độ (chỉ khi cần, không hỏi backend liên tục)
        if (this.hasRunning) this.timer = setTimeout(() => this.load(true), LIVE_REFRESH_MS);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = apiErrorMessage(err, 'Không tải được lịch sử phân tích');
        this.cdr.markForCheck();
      },
    });
  }

  changeFilter(): void { this.page = 0; this.load(); }

  goTo(page: number): void {
    if (page < 0 || page >= this.pageCount || page === this.page) return;
    this.page = page;
    this.load();
  }

  cancel(t: AnalysisTaskSummary): void {
    if (this.busyId || !confirm(`Huỷ lần phân tích "${t.video_name ?? t.task_id}"? Kết quả dở dang sẽ bị loại bỏ.`)) return;
    this.busyId = t.task_id;
    this.analyze.cancelTask(t.task_id).subscribe({
      next: (r) => {
        this.busyId = '';
        this.flash(r.status === 'cancelled' ? 'Đã huỷ lần phân tích.' : 'Đang dừng phân tích (sẽ dừng ở khung hình kế tiếp)...');
        this.load(true);
      },
      error: (err) => this.fail(err, 'Không huỷ được lần phân tích'),
    });
  }

  remove(t: AnalysisTaskSummary): void {
    const n = t.violations_detected;
    const msg = `Xoá vĩnh viễn lần phân tích "${t.video_name ?? t.task_id}"?\n\n`
      + `Sẽ xoá: ${n} hồ sơ vi phạm, ảnh bằng chứng và video kết quả. Video gốc cũng bị xoá nếu không còn lần phân tích nào dùng.`;
    if (this.busyId || !confirm(msg)) return;
    this.busyId = t.task_id;
    this.analyze.deleteTask(t.task_id).subscribe({
      next: () => {
        this.busyId = '';
        this.flash('Đã xoá lần phân tích và toàn bộ kết quả.');
        if (this.tasks.length === 1 && this.page > 0) this.page--;
        this.load(true);
      },
      error: (err) => this.fail(err, 'Không xoá được lần phân tích'),
    });
  }

  duration(t: AnalysisTaskSummary): string {
    const s = t.processing_time_seconds;
    if (s == null) return '—';
    const m = Math.floor(s / 60);
    return m ? `${m} phút ${Math.round(s % 60)} giây` : `${Math.round(s)} giây`;
  }

  private flash(msg: string): void {
    this.successMessage = msg;
    this.errorMessage = '';
    this.cdr.markForCheck();
    setTimeout(() => { if (this.successMessage === msg) { this.successMessage = ''; this.cdr.markForCheck(); } }, 4000);
  }

  private fail(err: unknown, fallback: string): void {
    this.busyId = '';
    this.errorMessage = apiErrorMessage(err, fallback);
    this.cdr.markForCheck();
  }
}

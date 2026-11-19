// src/app/core/services/analysis-session.service.ts
// "Phiên phân tích" hiện tại (upload -> theo dõi tiến độ -> kết quả) sống ở cấp ỨNG DỤNG, không nằm trong trang.
// => Chuyển sang trang khác (Lịch sử, Vi phạm...) KHÔNG làm mất upload / tiến độ; quay lại trang Phân tích video
//    vẫn thấy đúng trạng thái. Tải lại trang (F5) khi backend đang phân tích -> resume() hỏi backend và hiện lại.
import { Injectable, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Subscription, forkJoin } from 'rxjs';
import { AnalysisTaskStatus, AnalysisTaskSummary, AnalyzeService } from './analyze.service';
import { apiErrorMessage } from './location.service';
import { environment } from '../../../environments/environment';

export type AnalysisPhase = 'idle' | 'uploading' | 'analyzing' | 'completed' | 'failed';
export const ANALYSIS_STEPS = ['Tải video lên', 'Khởi động mô hình AI', 'Phân tích từng khung hình', 'Hoàn tất'];
const POLL_INTERVAL_MS = 2000;
const APP_TITLE = 'Traffic AI';

@Injectable({ providedIn: 'root' })
export class AnalysisSessionService {
  private analyze = inject(AnalyzeService);
  private title = inject(Title);
  private readonly baseTitle = this.title.getTitle();   // tiêu đề gốc của ứng dụng

  // ── Trạng thái (signal -> các trang tự cập nhật, kể cả ứng dụng zoneless) ──
  readonly phase = signal<AnalysisPhase>('idle');
  readonly uploadPercent = signal(0);
  readonly taskId = signal('');
  readonly taskStatus = signal<AnalysisTaskStatus | null>(null);
  readonly errorMessage = signal('');
  readonly cancelling = signal(false);
  readonly cancelled = signal(false);
  readonly fileName = signal('');          // tên video của phiên hiện tại
  readonly resultVideoUrl = signal('');    // video kết quả khi hoàn tất
  readonly now = signal(Date.now());       // đồng hồ (cập nhật mỗi giây khi đang chạy)
  /** Tăng mỗi khi một lần phân tích hoàn tất -> trang tải lại danh sách kết quả. */
  readonly completedCount = signal(0);

  readonly isBusy = computed(() => this.phase() === 'uploading' || this.phase() === 'analyzing');

  private startedAt = 0;
  private firstFrameAt = 0;
  private firstFrame = 0;
  private failedAtStep = 0;
  private clock: ReturnType<typeof setInterval> | null = null;
  private uploadSub?: Subscription;
  private pollSub?: Subscription;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private resumeChecked = false;

  // ── Thông tin dẫn xuất cho khung tiến trình ──
  readonly currentStep = computed(() => {
    const s = this.taskStatus();
    switch (this.phase()) {
      case 'uploading': return 0;
      case 'analyzing': return !s || s.status === 'pending' || !s.current_frame ? 1 : 2;
      case 'completed': return ANALYSIS_STEPS.length;
      case 'failed': return this.failedAtStep;
      default: return -1;
    }
  });

  readonly displayPercent = computed(() => {
    if (this.phase() === 'uploading') return this.uploadPercent();
    if (this.phase() === 'completed') return 100;
    return Math.round((this.taskStatus()?.progress ?? 0) * 10) / 10;
  });

  readonly statusText = computed(() => {
    const s = this.taskStatus();
    switch (this.phase()) {
      case 'uploading':
        return this.uploadPercent() < 100
          ? `Đang tải video lên máy chủ: ${this.fileName()}`
          : 'Đã tải lên xong, máy chủ đang kiểm tra file video...';
      case 'analyzing':
        if (!s) return 'Đang tạo tác vụ phân tích...';
        if (s.status === 'pending') return 'Đang chờ trong hàng đợi (máy chủ đang xử lý video khác)...';
        if (!s.current_frame) return 'Đang khởi động các mô hình AI (lần đầu sau khi bật backend có thể mất 1–2 phút)...';
        return 'AI đang phân tích từng khung hình: nhận diện xe, đèn tín hiệu, vạch dừng, biển số...';
      case 'completed': return 'Phân tích hoàn tất';
      case 'failed': return this.cancelled() ? 'Đã huỷ phân tích' : 'Phân tích thất bại';
      default: return '';
    }
  });

  readonly elapsedText = computed(() => (this.startedAt ? formatDuration((this.now() - this.startedAt) / 1000) : ''));

  /** Ước tính thời gian còn lại theo tốc độ xử lý thực tế (frame / giây). */
  readonly etaText = computed(() => {
    const s = this.taskStatus();
    const now = this.now();
    if (this.phase() !== 'analyzing' || !s || !s.total_frames) return '';
    if (!this.firstFrameAt || s.current_frame <= this.firstFrame) return 'đang ước tính...';
    const rate = (s.current_frame - this.firstFrame) / ((now - this.firstFrameAt) / 1000);
    return rate > 0 ? `khoảng ${formatDuration((s.total_frames - s.current_frame) / rate)}` : 'đang ước tính...';
  });

  // ─────────────────────────────── Điều khiển ───────────────────────────────
  /** Bắt đầu phân tích: upload file (nếu có) rồi theo dõi tiến độ. */
  start(file: File | undefined, locationId: number | null, displayName: string): void {
    if (this.isBusy()) return;
    this.stopPolling();
    this.phase.set(file ? 'uploading' : 'analyzing');
    this.uploadPercent.set(0);
    this.errorMessage.set('');
    this.taskStatus.set(null);
    this.taskId.set('');
    this.cancelling.set(false);
    this.cancelled.set(false);
    this.resultVideoUrl.set('');
    this.fileName.set(displayName);
    this.startClock(Date.now());

    this.uploadSub = this.analyze.startAnalysis(file, locationId).subscribe({
      next: (event) => {
        if (event.type === 'progress') this.uploadPercent.set(event.percent);
        else {
          this.taskId.set(event.response.task_id);
          this.phase.set('analyzing');
          this.poll();
        }
        this.updateTitle();
      },
      error: (err) => this.fail('Lỗi khởi chạy phân tích AI: ' + apiErrorMessage(err, err.message)),
    });
  }

  cancelUpload(): void {
    if (this.phase() !== 'uploading') return;
    this.uploadSub?.unsubscribe();
    this.phase.set('idle');
    this.uploadPercent.set(0);
    this.stopClock();
    this.updateTitle();
  }

  /** Huỷ lần phân tích đang chờ / đang chạy trên máy chủ. */
  cancelAnalysis(onError: (msg: string) => void): void {
    const id = this.taskId();
    if (this.phase() !== 'analyzing' || !id || this.cancelling()) return;
    this.cancelling.set(true);
    this.analyze.cancelTask(id).subscribe({
      next: () => { /* trạng thái 'cancelled' đến qua vòng theo dõi tiến độ */ },
      error: (err) => {
        this.cancelling.set(false);
        onError(err?.error?.detail || 'Không huỷ được phân tích');
      },
    });
  }

  /**
   * Khi chưa có phiên nào (VD: vừa tải lại trang): hỏi backend xem có lần phân tích đang chạy / đang chờ không,
   * nếu có thì hiện lại tiến trình như cũ. Chỉ hỏi 1 lần cho mỗi lần mở ứng dụng.
   */
  resume(): void {
    if (this.resumeChecked || this.phase() !== 'idle') return;
    this.resumeChecked = true;
    forkJoin([this.analyze.listTasks(1, 0, 'processing'), this.analyze.listTasks(1, 0, 'pending')]).subscribe({
      next: ([proc, pend]) => {
        const t: AnalysisTaskSummary | undefined = proc.items[0] ?? pend.items[0];
        if (!t || this.phase() !== 'idle') return;
        this.taskId.set(t.task_id);
        this.fileName.set(t.video_name ?? t.task_id);
        this.errorMessage.set('');
        this.cancelled.set(false);
        this.cancelling.set(false);
        this.phase.set('analyzing');
        const since = Date.parse(t.started_at ?? t.created_at);
        this.startClock(Number.isNaN(since) ? Date.now() : since);
        this.poll();
      },
      error: () => { /* không tải được -> giữ trạng thái chờ, người dùng vẫn bắt đầu được lần mới */ },
    });
  }

  /**
   * Gọi khi rời trang Phân tích video. Phiên ĐÃ KẾT THÚC (xong / lỗi / huỷ) mà người dùng đã xem
   * -> xoá để lần sau vào lại trang ở trạng thái mới. Phiên đang tải lên / đang phân tích thì giữ nguyên.
   */
  leavePage(): void {
    if (this.phase() === 'completed' || this.phase() === 'failed') this.reset();
  }

  /** Về trạng thái ban đầu (chưa có phiên phân tích nào). */
  reset(): void {
    if (this.isBusy()) return;
    this.stopPolling();
    this.stopClock();
    this.startedAt = 0;
    this.failedAtStep = 0;
    this.phase.set('idle');
    this.uploadPercent.set(0);
    this.taskId.set('');
    this.taskStatus.set(null);
    this.errorMessage.set('');
    this.cancelling.set(false);
    this.cancelled.set(false);
    this.fileName.set('');
    this.resultVideoUrl.set('');
    this.updateTitle();
  }

  // ─────────────────────────────── Nội bộ ───────────────────────────────
  private poll(): void {
    this.stopPolling();
    // setTimeout nối tiếp (không dùng setInterval) để không bắn request chồng chéo khi server chậm
    this.pollSub = this.analyze.getTaskStatus(this.taskId()).subscribe({
      next: (status) => {
        this.taskStatus.set(status);
        if (status.current_frame > 0 && !this.firstFrameAt) {   // mốc để ước tính thời gian còn lại
          this.firstFrameAt = Date.now();
          this.firstFrame = status.current_frame;
        }
        if (status.status === 'completed') {
          this.phase.set('completed');
          this.stopClock();
          if (status.output_video_url) this.resultVideoUrl.set(`${environment.staticUrl}${status.output_video_url}?t=${Date.now()}`);
          this.completedCount.update((n) => n + 1);
        } else if (status.status === 'cancelled') {
          this.cancelled.set(true);
          this.cancelling.set(false);
          this.fail('Đã huỷ phân tích theo yêu cầu. Kết quả dở dang đã được loại bỏ.');
        } else if (status.status === 'failed') {
          this.fail('Phân tích video thất bại: ' + (status.error || 'Lỗi không xác định'));
        } else {
          this.pollTimer = setTimeout(() => this.poll(), POLL_INTERVAL_MS);
        }
        this.updateTitle();
      },
      error: (err) => this.fail(
        err.status === 404
          ? 'Không tìm thấy tác vụ phân tích (có thể server backend đã khởi động lại).'
          : 'Mất kết nối tới máy chủ khi theo dõi tiến độ phân tích.',
      ),
    });
  }

  private fail(message: string): void {
    this.failedAtStep = Math.max(0, this.currentStep());
    this.phase.set('failed');
    this.errorMessage.set(message);
    this.stopClock();
    this.stopPolling();
    this.updateTitle();
  }

  private startClock(since: number): void {
    this.stopClock();
    this.startedAt = since;
    this.now.set(Date.now());
    this.firstFrameAt = 0;
    this.firstFrame = 0;
    this.clock = setInterval(() => { this.now.set(Date.now()); this.updateTitle(); }, 1000);
  }

  private stopClock(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    this.now.set(Date.now());
  }

  private stopPolling(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    this.pollSub?.unsubscribe();
  }

  /** % hiện trên tab trình duyệt ở MỌI trang, để làm việc khác vẫn theo dõi được. */
  private updateTitle(): void {
    if (this.isBusy()) this.title.setTitle(`(${Math.floor(this.displayPercent())}%) Đang phân tích video – ${APP_TITLE}`);
    else if (this.phase() === 'completed') this.title.setTitle(`Phân tích xong – ${APP_TITLE}`);
    else if (this.phase() === 'failed') this.title.setTitle(`${this.cancelled() ? 'Đã huỷ phân tích' : 'Phân tích thất bại'} – ${APP_TITLE}`);
    else this.title.setTitle(this.baseTitle);
  }
}

function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} phút ${String(s % 60).padStart(2, '0')} giây` : `${s} giây`;
}

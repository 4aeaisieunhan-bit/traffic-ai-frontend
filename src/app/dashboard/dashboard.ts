import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AnalyzeService } from '../core/services/analyze.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  // Backend không có /dashboard/stats → dùng /analyze/output/details (đã có sẵn)
  private analyzeService = inject(AnalyzeService);
  // App chạy zoneless nên phải báo Angular cập nhật view sau mỗi callback bất đồng bộ
  private cdr = inject(ChangeDetectorRef);

  videoUrl = this.analyzeService.getVideoStreamUrl();

  loading = true;
  loadError = '';

  // Thông tin video output
  videoReady = false;
  totalFramesProcessed = 0;
  resolution = '';
  fps = 0;

  // Số liệu phát hiện
  identifiedVehicles = 0;
  legitimateTurns = 0;
  totalViolations = 0;
  unprocessedViolations = 0;
  confirmedViolations = 0;

  // Biểu đồ phân loại vi phạm (từ detection_summary.type_breakdown)
  chartData: { label: string; height: number; count: number }[] = [];

  latestViolations: {
    id: number;
    plate: string;
    videoTime: string;
    type: string;
    conf: string;
    status: string;
  }[] = [];

  ngOnInit(): void {
    this.loadStats();
  }

  loadStats(): void {
    this.loading = true;
    this.loadError = '';
    this.analyzeService.getOutputDetails().subscribe({
      next: (res) => {
        const info = res.video_info;
        const sum = res.detection_summary;

        this.videoReady = info.is_ready;
        this.totalFramesProcessed = info.total_frames;
        this.resolution = info.resolution ?? '';
        this.fps = info.fps ?? 0;

        this.identifiedVehicles = sum.vehicles_scanned;
        this.legitimateTurns = sum.legitimate_turns;
        this.totalViolations = sum.violations_detected;
        this.unprocessedViolations = sum.unprocessed_count;
        this.confirmedViolations = sum.confirmed_count;

        const entries = Object.entries(sum.type_breakdown || {}).sort((a, b) => b[1] - a[1]);
        const maxCount = Math.max(1, ...entries.map(([, c]) => c));
        this.chartData = entries.map(([label, count]) => ({
          label,
          count,
          height: Math.max(8, Math.round((count / maxCount) * 100)),
        }));

        // 5 vi phạm mới nhất (backend trả theo id tăng dần)
        this.latestViolations = [...(res.violations || [])]
          .sort((a, b) => b.id - a.id)
          .slice(0, 5)
          .map((v) => ({
            id: v.id,
            plate: v.license_plate,
            videoTime: v.video_time || v.time_str,
            type: v.violation_type,
            conf: v.confidence_overall === null ? '—' : `${v.confidence_overall}%`,
            status: v.status,
          }));

        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Lỗi tải thống kê Dashboard:', err);
        this.loadError = 'Không tải được dữ liệu từ backend (http://localhost:8000).';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
}

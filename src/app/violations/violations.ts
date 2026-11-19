import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ViolationService, ViolationItem, ViolationSummaryCounts } from '../core/services/violation.service';
import { PctPipe } from '../core/pipes/pct.pipe';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-violations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PctPipe],
  templateUrl: './violations.html',
  styleUrl: './violations.css',
})
export class Violations implements OnInit {
  private violationService = inject(ViolationService);
  // App chạy zoneless nên phải báo Angular cập nhật view sau mỗi callback bất đồng bộ
  private cdr = inject(ChangeDetectorRef);
  staticUrl = environment.staticUrl;

  violations: ViolationItem[] = [];
  summary: ViolationSummaryCounts = {
    totalViolations: 0,
    todayViolations: 0,
    pendingApproval: 0,
    confirmedViolations: 0,
  };

  searchQuery = '';
  selectedViolationType = 'Tất cả loại vi phạm';
  selectedLocation = 'Tất cả vị trí';
  selectedStatus = 'Tất cả trạng thái';
  dateFrom = '';   // YYYY-MM-DD
  dateTo = '';
  exporting: '' | 'xlsx' | 'pdf' = '';
  exportError = '';

  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  loading = false;

  // Lựa chọn cho dropdown lọc - lấy từ backend (/violations/meta/filters)
  violationTypeOptions: string[] = [];
  locationOptions: string[] = [];
  videoSourceOptions: string[] = [];

  ngOnInit(): void {
    this.loadFilterOptions();
    this.loadCounts();
    this.loadViolations();
  }

  loadFilterOptions(): void {
    this.violationService.getFilterOptions().subscribe({
      next: (opts) => {
        this.violationTypeOptions = opts.violation_types.map((t) => t.name);
        this.locationOptions = opts.locations;
        this.videoSourceOptions = opts.video_sources;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Lỗi tải bộ lọc:', err),
    });
  }

  loadCounts(): void {
    this.violationService.getViolationCounts().subscribe({
      next: (counts) => {
        this.summary = counts;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Lỗi tải tổng hợp vi phạm:', err),
    });
  }

  loadViolations(): void {
    this.loading = true;
    this.violationService
      .getViolations({
        ...this.currentFilter(),
        page: this.currentPage,
        limit: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.violations = res.items;
          this.totalItems = res.total;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Lỗi tải danh sách vi phạm:', err);
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  onSearch(): void {
    this.currentPage = 1;
    this.loadViolations();
  }

  private currentFilter() {
    return {
      search: this.searchQuery,
      violation_type: this.selectedViolationType,
      location: this.selectedLocation !== 'Tất cả vị trí' ? this.selectedLocation : undefined,
      status: this.selectedStatus,
      date_from: this.dateFrom || undefined,
      date_to: this.dateTo || undefined,
    };
  }

  /** Xuất báo cáo Excel / PDF theo đúng bộ lọc đang chọn. */
  exportReport(format: 'xlsx' | 'pdf'): void {
    if (this.exporting) return;
    this.exporting = format;
    this.exportError = '';
    this.violationService.exportReport(format, this.currentFilter()).subscribe({
      next: (res) => {
        const disposition = res.headers.get('Content-Disposition') ?? '';
        const name = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? `bao-cao-vi-pham.${format}`;
        const url = URL.createObjectURL(res.body!);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.exporting = '';
        this.cdr.markForCheck();
      },
      error: () => {
        this.exporting = '';
        this.exportError = 'Không xuất được báo cáo. Kiểm tra kết nối tới máy chủ rồi thử lại.';
        this.cdr.markForCheck();
      },
    });
  }

  resetFilters(): void {
    this.dateFrom = '';
    this.dateTo = '';
    this.searchQuery = '';
    this.selectedViolationType = 'Tất cả loại vi phạm';
    this.selectedLocation = 'Tất cả vị trí';
    this.selectedStatus = 'Tất cả trạng thái';
    this.currentPage = 1;
    this.loadViolations();
  }

  getConfidencePillClass(conf: number | null): string {
    if (conf === null) return 'low';
    if (conf >= 95) return 'high';
    if (conf >= 85) return 'mid';
    return 'low';
  }
}

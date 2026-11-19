import { ChangeDetectorRef, Component, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.services';
import {
  REJECT_HAS_HELMET, ViolationService, ViolationItem, ViolationReview, ViolationStatus,
} from '../../core/services/violation.service';
import { PctPipe } from '../../core/pipes/pct.pipe';
import { MediaService } from '../../core/services/media.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-violation-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PctPipe],
  templateUrl: './violation-detail.html',
  styleUrl: './violation-detail.css',
})
export class ViolationDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private violationService = inject(ViolationService);
  private cdr = inject(ChangeDetectorRef);
  staticUrl = environment.staticUrl;
  /** Mở / tải ảnh gốc qua blob (link thẳng tới backend bị 401 khi frontend và backend khác tên miền). */
  readonly media = inject(MediaService);
  private router = inject(Router);
  private auth = inject(AuthService);
  /** Xoá hồ sơ: chỉ quản trị viên. */
  isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');
  deleting = false;

  violationId = 1;
  violation: ViolationItem | null = null;
  reviews: ViolationReview[] = [];
  reviewNote = '';
  readonly rejectHasHelmet = REJECT_HAS_HELMET;
  loading = true;
  actionMessage = '';

  /** Xoá hồ sơ (VD: AI nhận nhầm) cùng ảnh bằng chứng và lịch sử duyệt. */
  deleteRecord(): void {
    if (!this.violation || this.deleting) return;
    if (!confirm(`Xoá vĩnh viễn hồ sơ ${this.violation.violation_code}? Ảnh bằng chứng và lịch sử duyệt cũng bị xoá.`)) return;
    this.deleting = true;
    this.violationService.deleteViolation(this.violation.id).subscribe({
      next: () => this.router.navigate(['/admin/violations']),
      error: (err) => {
        this.deleting = false;
        alert(err?.error?.detail || 'Không xoá được hồ sơ');
        this.cdr.markForCheck();
      },
    });
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.violationId = parseInt(idParam, 10) || 1;
    }
    this.loadDetail();
  }

  loadDetail(): void {
    this.loading = true;
    this.violationService.getViolationById(this.violationId).subscribe({
      next: (data) => {
        this.violation = data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Lỗi tải chi tiết vi phạm:', err);
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
    this.loadReviews();
  }

  loadReviews(): void {
    this.violationService.getReviews(this.violationId).subscribe({
      next: (data) => {
        this.reviews = data;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('Lỗi tải lịch sử duyệt:', err),
    });
  }

  /** Lỗi không đội mũ: có thêm nút "Có đội mũ (AI nhầm)" để từ chối hồ sơ. */
  get isHelmetViolation(): boolean {
    return this.violation?.violation_type_code === 'NO_HELMET';
  }

  updateStatus(newStatus: ViolationStatus, reasonCode?: string): void {
    if (!this.violation) return;
    this.violationService.updateStatus(this.violation.id, newStatus, this.reviewNote.trim(), reasonCode).subscribe({
      next: (updated) => {
        this.violation = updated;
        this.reviewNote = '';
        this.loadReviews();
        this.actionMessage = `Đã cập nhật trạng thái hồ sơ: ${newStatus}`;
        this.cdr.markForCheck();
        setTimeout(() => {
          this.actionMessage = '';
          this.cdr.markForCheck();
        }, 3000);
      },
      error: (err) => alert('Lỗi khi cập nhật trạng thái: ' + (err?.error?.detail || err.message)),
    });
  }
}

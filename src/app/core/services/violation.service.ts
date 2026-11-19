// src/app/core/services/violation.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ViolationStatus = 'Chưa xử lý' | 'Đã xác nhận' | 'Từ chối';

export interface ViolationItem {
  id: number;
  violation_code: string;
  task_id: string;
  video_id: number | null;
  video_source: string | null;
  location: string | null;
  license_plate: string;
  vehicle_type: string | null;
  vehicle_color: string | null;
  violation_type: string;
  violation_type_code: string;
  ai_reason: string | null;
  track_id: number | null;
  frame_index: number | null;
  video_time_sec: number | null;
  occurred_at: string;
  time_str: string;
  date_str: string;
  video_time: string | null;
  // null = mô hình không cung cấp điểm tin cậy
  confidence_overall: number | null;
  confidence_vehicle: number | null;
  confidence_light: number | null;
  confidence_plate: number | null;
  confidence_violation: number | null;
  status: ViolationStatus;
  evidence_image: string | null;
  plate_crop_image: string | null;
  /** Ảnh cận cảnh người vi phạm (lỗi không đội mũ), đầu được khoanh đỏ */
  subject_crop_image?: string | null;
  created_at: string;
}

/** Lý do từ chối có mã: người lái có đội mũ, AI nhận nhầm thành "không đội mũ". */
export const REJECT_HAS_HELMET = 'has_helmet';

/** Bộ lọc danh sách / báo cáo vi phạm. */
export interface ViolationFilter {
  search?: string;
  violation_type?: string;
  location?: string;
  status?: string;
  date_from?: string;   // YYYY-MM-DD
  date_to?: string;
}

export interface ViolationReview {
  id: number;
  old_status: ViolationStatus;
  new_status: ViolationStatus;
  note: string | null;
  reviewer_name: string | null;
  reviewed_at: string;
}

export interface ViolationFilterOptions {
  violation_types: { id: number; code: string; name: string; description: string | null }[];
  video_sources: string[];
  locations: string[];
}

export interface ViolationListResponse {
  total: number;
  page: number;
  limit: number;
  items: ViolationItem[];
}

export interface ViolationSummaryCounts {
  totalViolations: number;
  todayViolations: number;
  pendingApproval: number;
  confirmedViolations: number;
  rejectedViolations?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ViolationService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/violations`;

  getViolations(filter?: ViolationFilter & { page?: number; limit?: number }): Observable<ViolationListResponse> {
    let params = this.filterParams(filter);
    if (filter?.page) params = params.set('page', filter.page.toString());
    if (filter?.limit) params = params.set('limit', filter.limit.toString());
    return this.http.get<ViolationListResponse>(this.apiUrl, { params });
  }

  /** Tải báo cáo Excel / PDF theo đúng bộ lọc đang chọn (trả về file + tên file do server đặt). */
  exportReport(format: 'xlsx' | 'pdf', filter?: ViolationFilter): Observable<HttpResponse<Blob>> {
    const params = this.filterParams(filter).set('format', format);
    return this.http.get(`${this.apiUrl}/export`, { params, responseType: 'blob', observe: 'response' });
  }

  private filterParams(filter?: ViolationFilter): HttpParams {
    let params = new HttpParams();
    if (filter?.search) params = params.set('search', filter.search);
    if (filter?.violation_type && filter.violation_type !== 'Tất cả loại vi phạm') {
      params = params.set('violation_type', filter.violation_type);
    }
    if (filter?.location && filter.location !== 'Tất cả vị trí') {
      params = params.set('location', filter.location);
    }
    if (filter?.status && filter.status !== 'Tất cả trạng thái') {
      params = params.set('status', filter.status);
    }
    if (filter?.date_from) params = params.set('date_from', filter.date_from);
    if (filter?.date_to) params = params.set('date_to', filter.date_to);
    return params;
  }

  getViolationCounts(): Observable<ViolationSummaryCounts> {
    return this.http.get<ViolationSummaryCounts>(`${this.apiUrl}/summary/counts`);
  }

  getViolationById(id: number): Observable<ViolationItem> {
    return this.http.get<ViolationItem>(`${this.apiUrl}/${id}`);
  }

  /** Xoá hồ sơ vi phạm (VD: AI nhận nhầm) — chỉ quản trị viên. */
  deleteViolation(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  updateStatus(id: number, status: ViolationStatus, note?: string, reasonCode?: string): Observable<ViolationItem> {
    return this.http.patch<ViolationItem>(`${this.apiUrl}/${id}/status`, {
      status, note: note || null, reason_code: reasonCode || null,
    });
  }

  getReviews(id: number): Observable<ViolationReview[]> {
    return this.http.get<ViolationReview[]>(`${this.apiUrl}/${id}/reviews`);
  }

  getFilterOptions(): Observable<ViolationFilterOptions> {
    return this.http.get<ViolationFilterOptions>(`${this.apiUrl}/meta/filters`);
  }
}

// src/app/core/services/analyze.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ViolationItem } from './violation.service';
import { AuthService } from './auth.services';

export interface StartAnalysisResponse {
  status: string;
  message: string;
  task_id: string;
  video_id: number;
  input_video_name: string;
  location: string | null;
}

/** Sự kiện trả về trong lúc upload: tiến độ (%) hoặc kết quả cuối cùng từ server. */
export type UploadEvent =
  | { type: 'progress'; percent: number }
  | { type: 'done'; response: StartAnalysisResponse };

export interface AnalysisTaskStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_frame: number;
  total_frames: number;
  violations_detected: number;
  vehicles_scanned?: number;
  legitimate_turns?: number;
  fps?: number;
  duration_seconds?: number;
  processing_time_seconds?: number;
  output_video_url?: string;
  model_stats?: Record<string, any>;
  violations?: ViolationItem[];
  error?: string;
}

export interface AnalysisTaskSummary {
  task_id: string;
  video_id: number;
  video_name: string | null;
  location: string | null;
  status: AnalysisTaskStatus['status'];
  progress: number;
  current_frame?: number;
  total_frames?: number;
  violations_detected: number;
  vehicles_scanned?: number;
  processing_time_seconds?: number | null;
  output_video_url?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at: string | null;
  error: string | null;
}

export interface TaskPage {
  total: number;
  items: AnalysisTaskSummary[];
}

export interface OutputVideoDetails {
  status: string;
  latest_task: AnalysisTaskSummary | null;
  video_info: {
    file_name: string | null;
    source_video: string | null;
    file_size_mb: number;
    resolution: string | null;
    width: number | null;
    height: number | null;
    fps: number | null;
    total_frames: number;
    duration_seconds: number;
    video_stream_url: string;
    static_video_url: string;
    is_ready: boolean;
  };
  detection_summary: {
    vehicles_scanned: number;
    legitimate_turns: number;
    violations_detected: number;
    unprocessed_count: number;
    confirmed_count: number;
    rejected_count: number;
    type_breakdown: Record<string, number>;
  };
  model_stats: Record<string, {
    model_name: string;
    weight_file: string;
    detections: number;
    avg_confidence: number | null; // 0..1
    classes: string[];
  }>;
  violations: ViolationItem[];
}

export interface LatestAnalysisSummary {
  video_name: string;
  source_video: string;
  video_size_mb: number;
  resolution: string;
  total_frames: number;
  fps: number;
  duration_seconds: number;
  vehicles_scanned: number;
  legitimate_turns: number;
  violations_count: number;
  video_stream_url: string;
  static_video_url: string;
  violations: any[];
}

@Injectable({
  providedIn: 'root',
})
export class AnalyzeService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private apiUrl = `${environment.apiUrl}/analyze`;

  /**
   * Upload video (hoặc dùng video mẫu nếu không truyền file) và khởi chạy phân tích AI.
   * Dùng XMLHttpRequest thay cho HttpClient vì app cấu hình `withFetch()`,
   * mà Fetch API không báo được tiến độ upload.
   */
  startAnalysis(file?: File, locationId?: number | null): Observable<UploadEvent> {
    return new Observable<UploadEvent>((subscriber) => {
      const formData = new FormData();
      if (file) {
        formData.append('file', file, file.name);
      }
      // Bắt buộc khi upload file (backend trả 400 nếu thiếu)
      if (locationId != null) {
        formData.append('location_id', String(locationId));
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.apiUrl}/start`);
      xhr.responseType = 'json';
      // XHR không đi qua HttpInterceptor -> tự gắn token
      const token = this.auth.getToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          subscriber.next({ type: 'progress', percent: Math.round((e.loaded / e.total) * 100) });
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          subscriber.next({ type: 'done', response: xhr.response as StartAnalysisResponse });
          subscriber.complete();
        } else {
          subscriber.error({ status: xhr.status, error: xhr.response, message: `HTTP ${xhr.status}` });
        }
      };
      xhr.onerror = () =>
        subscriber.error({ status: 0, message: 'Không kết nối được tới máy chủ backend' });

      xhr.send(formData);
      return () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) xhr.abort();
      };
    });
  }

  /** Lịch sử các lần phân tích (mới nhất trước), có phân trang + lọc trạng thái. */
  listTasks(limit = 20, offset = 0, status = ''): Observable<TaskPage> {
    const params: Record<string, string | number> = { limit, offset };
    if (status) params['status'] = status;
    return this.http.get<TaskPage>(`${this.apiUrl}/tasks`, { params });
  }

  /** Huỷ lần phân tích đang chờ / đang chạy (kết quả dở dang bị loại bỏ). */
  cancelTask(taskId: string): Observable<{ status: 'cancelled' | 'cancelling' }> {
    return this.http.post<{ status: 'cancelled' | 'cancelling' }>(`${this.apiUrl}/tasks/${taskId}/cancel`, {});
  }

  /** Xoá lần phân tích + toàn bộ kết quả (chỉ quản trị viên). */
  deleteTask(taskId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/tasks/${taskId}`);
  }

  getTaskStatus(taskId: string): Observable<AnalysisTaskStatus> {
    return this.http.get<AnalysisTaskStatus>(`${this.apiUrl}/status/${taskId}`);
  }

  getOutputDetails(): Observable<OutputVideoDetails> {
    return this.http.get<OutputVideoDetails>(`${this.apiUrl}/output/details`);
  }

  getLatestSummary(): Observable<LatestAnalysisSummary> {
    return this.http.get<LatestAnalysisSummary>(`${this.apiUrl}/summary/latest`);
  }

  getVideoStreamUrl(): string {
    return `${this.apiUrl}/video/output`;
  }
}

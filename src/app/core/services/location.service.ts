// src/app/core/services/location.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LocationItem {
  id: number;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  video_count: number;
  violation_count: number;
}

export interface LocationPayload {
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** Lấy thông báo lỗi tiếng Việt từ response FastAPI (detail là string hoặc mảng lỗi validate). */
export function apiErrorMessage(err: any, fallback = 'Có lỗi xảy ra'): string {
  const detail = err?.error?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d: any) => `${(d.loc || []).slice(1).join('.')}: ${d.msg}`).join('; ');
  }
  return err?.status === 0 ? 'Không kết nối được tới máy chủ backend' : fallback;
}

@Injectable({ providedIn: 'root' })
export class LocationService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/locations`;

  list(): Observable<LocationItem[]> {
    return this.http.get<LocationItem[]>(this.apiUrl);
  }

  create(payload: LocationPayload): Observable<LocationItem> {
    return this.http.post<LocationItem>(this.apiUrl, payload);
  }

  update(id: number, payload: LocationPayload): Observable<LocationItem> {
    return this.http.put<LocationItem>(`${this.apiUrl}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}

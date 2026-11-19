// Quản lý tài khoản - chỉ quản trị viên (backend /api/v1/users)
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, UserRole } from '../models/user.model';

export interface AdminUser extends User {
  active_sessions: number;
}

@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/users`;

  list(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(this.apiUrl);
  }

  update(id: number, changes: { is_active?: boolean; role?: UserRole }): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.apiUrl}/${id}`, changes);
  }

  resetPassword(id: number): Observable<{ temporary_password: string }> {
    return this.http.post<{ temporary_password: string }>(`${this.apiUrl}/${id}/reset-password`, {});
  }
}

// src/app/core/services/auth.services.ts
// Đăng nhập / đăng ký / đăng xuất qua backend /api/v1/auth.
// Token lưu ở localStorage khi "Ghi nhớ đăng nhập", ngược lại ở sessionStorage (mất khi đóng trình duyệt).
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, finalize, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginResponse, User } from '../models/user.model';

const TOKEN_KEY = 'traffic_ai_token';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/auth`;

  // Signal -> component tự cập nhật khi đăng nhập / đăng xuất (app chạy zoneless)
  private readonly _user = signal<User | null>(null);
  readonly currentUser = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);

  // ---------------------------------------------------------------- token
  // Dự phòng khi trình duyệt chặn storage (chế độ riêng tư...): vẫn dùng được trong phiên hiện tại
  private memoryToken: string | null = null;

  getToken(): string | null {
    return this.storageGet(localStorage) ?? this.storageGet(sessionStorage) ?? this.memoryToken;
  }

  private storageGet(s: Storage): string | null {
    try {
      return s.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private saveToken(token: string, remember: boolean): void {
    this.clearToken();
    try {
      (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    } catch {
      /* trình duyệt chặn storage: vẫn đăng nhập được trong phiên hiện tại */
    }
    this.memoryToken = token;
  }

  private clearToken(): void {
    this.memoryToken = null;
    for (const s of [localStorage, sessionStorage]) {
      try {
        s.removeItem(TOKEN_KEY);
      } catch {
        /* bỏ qua */
      }
    }
  }

  // ---------------------------------------------------------------- API
  login(email: string, password: string, remember: boolean): Observable<User> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, { email, password, remember }).pipe(
      tap((res) => {
        this.saveToken(res.access_token, remember);
        this._user.set(res.user);
      }),
      map((res) => res.user),
    );
  }

  register(fullName: string, email: string, password: string): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/register`, { full_name: fullName, email, password });
  }

  /** Đổi mật khẩu; server đăng xuất các thiết bị khác, phiên hiện tại giữ nguyên. */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/change-password`, {
      current_password: currentPassword,
      new_password: newPassword,
    });
  }

  isAdmin(): boolean {
    return this._user()?.role === 'admin';
  }

  /** Gọi API xóa phiên trên server (nếu còn token), sau đó xóa token ở trình duyệt. */
  logout(): Observable<void> {
    const hadToken = !!this.getToken();
    const request = hadToken ? this.http.post<void>(`${this.apiUrl}/logout`, {}) : of(undefined);
    return request.pipe(
      catchError(() => of(undefined)), // token đã hết hạn trên server -> vẫn đăng xuất ở client
      finalize(() => this.clearSession()),
      map(() => undefined),
    );
  }

  /** Xóa trạng thái đăng nhập ở client (dùng khi server trả 401). */
  clearSession(): void {
    this.clearToken();
    this._user.set(null);
  }

  /**
   * Khôi phục người dùng từ token đã lưu (khi tải lại trang).
   * Trả về true nếu token còn hiệu lực.
   */
  restoreSession(): Observable<boolean> {
    if (this._user()) return of(true);
    if (!this.getToken()) return of(false);
    return this.http.get<User>(`${this.apiUrl}/me`).pipe(
      tap((user) => this._user.set(user)),
      map(() => true),
      catchError(() => {
        this.clearSession();
        return of(false);
      }),
    );
  }

  getRole(): User['role'] | null {
    return this._user()?.role ?? null;
  }
}

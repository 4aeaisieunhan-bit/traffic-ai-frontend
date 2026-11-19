// Tài khoản người dùng (khớp UserResponse của backend /api/v1/auth)
export type UserRole = 'admin' | 'officer';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  expires_at: string;
  user: User;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Quản trị viên',
  officer: 'Cán bộ',
};

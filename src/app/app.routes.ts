import { Routes } from '@angular/router';

import { Hompage } from './hompage/hompage';
import { Login } from './auth/login/login';
import { Register } from './auth/register/register';

import { Layout } from './layout/layout';

import { Dashboard } from './dashboard/dashboard';
import { VideoAnalysis } from './video-analysis/video-analysis';
import { Violations } from './violations/violations';
import { Statistics } from './statistics/statistics';
import { ViolationDetail } from './violations/violation-detail/violation-detail';
import { Locations } from './locations/locations';
import { adminGuard, authGuard, guestGuard } from './core/guards/auth.guard';
import { Account } from './account/account';
import { Users } from './users/users';
import { History } from './history/history';

export const routes: Routes = [
  // =========================
  // HOMEPAGE
  // =========================
  {
    path: '',
    component: Hompage,
  },

  // =========================
  // AUTH
  // =========================
  {
    path: 'login',
    component: Login,
    canActivate: [guestGuard],
  },
  {
    path: 'register',
    component: Register,
    canActivate: [guestGuard],
  },

  // =========================
  // ADMIN (bắt buộc đăng nhập)
  // =========================
  {
    path: 'admin',
    canActivate: [authGuard],
    component: Layout,
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        component: Dashboard,
      },
      {
        path: 'video-analysis',
        component: VideoAnalysis,
      },
      // Tương thích ngược chuyển hướng toàn bộ route Camera sang Phân Tích Video
      {
        path: 'cameras',
        redirectTo: 'video-analysis',
        pathMatch: 'full',
      },
      {
        path: 'cameras/:id/analyze',
        redirectTo: 'video-analysis',
      },
      {
        path: 'cameras/:id',
        redirectTo: 'video-analysis',
      },
      {
        path: 'history',
        component: History,
      },
      {
        path: 'violations',
        component: Violations,
      },
      {
        path: 'violations/:id',
        component: ViolationDetail,
      },
      {
        path: 'statistics',
        component: Statistics,
      },
      {
        path: 'locations',
        component: Locations,
      },
      {
        path: 'account',
        component: Account,
      },
      {
        path: 'users',
        component: Users,
        canActivate: [adminGuard],
      },
    ],
  },

  // Fallback
  {
    path: '**',
    redirectTo: '',
  },
];

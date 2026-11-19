// src/app/core/services/statistics.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ViolationTypeStat {
  name: string;
  count: number;
  percentage: number;
}

export interface VehicleTypeStat {
  name: string;
  count: number;
  percentage: number;
}

export interface DateStat {
  date: string;
  count: number;
}

// null = chưa có số liệu (chưa có lần phân tích nào ghi task_model_stats)
export interface ModelAccuracyStat {
  vehicle: number | null;
  trafficLight: number | null;
  helmet: number | null;
  plateOcr: number | null;
  overall: number | null;
}

export interface StatisticsSummary {
  totalViolations: number;
  todayViolations: number;
  confirmedViolations: number;
  pendingApproval: number;
  rejectedViolations: number;
  avgConfidence: number;
  byType: ViolationTypeStat[];
  byVehicle: VehicleTypeStat[];
  byDate: DateStat[];
  modelAccuracy: ModelAccuracyStat;
}

@Injectable({
  providedIn: 'root',
})
export class StatisticsService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/statistics`;

  getSummary(): Observable<StatisticsSummary> {
    return this.http.get<StatisticsSummary>(`${this.apiUrl}/summary`);
  }
}


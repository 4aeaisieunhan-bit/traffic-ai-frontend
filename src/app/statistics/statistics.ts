import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatisticsService, StatisticsSummary } from '../core/services/statistics.service';
import { PctPipe } from '../core/pipes/pct.pipe';

@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [CommonModule, PctPipe],
  styleUrl: './statistics.css',
  templateUrl: './statistics.html',
})
export class Statistics implements OnInit {
  private statisticsService = inject(StatisticsService);
  private cdr = inject(ChangeDetectorRef);

  summary: StatisticsSummary | null = null;
  loading = true;

  ngOnInit(): void {
    this.loadStatistics();
  }

  loadStatistics(): void {
    this.loading = true;
    this.statisticsService.getSummary().subscribe({
      next: (data) => {
        this.summary = data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Lỗi tải thống kê:', err);
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
}

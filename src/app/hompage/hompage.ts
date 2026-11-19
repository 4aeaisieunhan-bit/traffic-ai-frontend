import { Component, OnInit, inject, signal } from '@angular/core';
import {RouterLink} from '@angular/router';
import { CinematicHero } from './cinematic-hero/cinematic-hero';
import { PublicStats, SystemService } from '../core/services/system.service';
@Component({
  imports: [RouterLink, CinematicHero],
  selector: 'app-hompage',
  styleUrl: './hompage.css',
  templateUrl: './hompage.html',
})
export class Hompage implements OnInit {
  private system = inject(SystemService);
  /** Số liệu thật từ backend (null = đang tải / không kết nối được). */
  readonly stats = signal<PublicStats | null>(null);

  ngOnInit(): void {
    this.system.publicStats().subscribe({ next: (s) => this.stats.set(s), error: () => this.stats.set(null) });
  }

  fmt(n: number | null | undefined): string {
    return n == null ? '—' : n.toLocaleString('vi-VN');
  }
}

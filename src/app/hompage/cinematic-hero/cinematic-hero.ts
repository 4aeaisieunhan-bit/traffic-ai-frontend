// Nền 3D điện ảnh tràn màn hình cho hero trang chủ.
// Engine (Three.js + GSAP) được tải động -> gói riêng, không làm nặng các trang khác.
import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import type { CinematicEngine, CinematicHud } from './engine/cinematic-engine';

const MOTION_KEY = 'traffic_ai_hero_motion';   // 'on' | 'off' — lựa chọn của người xem

@Component({
  selector: 'app-cinematic-hero',
  standalone: true,
  templateUrl: './cinematic-hero.html',
  styleUrl: './cinematic-hero.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CinematicHero implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLElement>;
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  readonly playing = signal(false);
  /** Hệ điều hành bật "giảm chuyển động" -> mặc định ảnh tĩnh, có nút ▶ để xem. */
  readonly systemReducedMotion = signal(false);

  private readonly zone = inject(NgZone);
  private engine: CinematicEngine | null = null;
  private wantPlay = true;           // người xem muốn phát (nút ▶ / ⏸)
  private inView = true;
  private disposed = false;
  private cleanups: (() => void)[] = [];

  async ngAfterViewInit(): Promise<void> {
    if (typeof window === 'undefined') return;
    const host = this.hostRef.nativeElement;
    const q = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T;
    const hud: CinematicHud = {
      cctv: q('.cctv'), clock: q('.js-clock'), speed: q('.js-speed'), trackState: q('.js-track'), freezeChip: q('.js-freeze'),
      box: q('.det-box'), boxTag: q('.det-tag'), boxMeta: q('.det-meta'),
      alert: q('.alert'), alertInfo: q('.alert-info'), alertSpeed: q('.js-alert-speed'), flash: q('.flash'), fade: q('.fade'),
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.systemReducedMotion.set(reduced);
    let saved: string | null = null;
    try { saved = localStorage.getItem(MOTION_KEY); } catch { /* storage bị chặn */ }
    this.wantPlay = saved === 'on' ? true : saved === 'off' ? false : !reduced;

    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const weak = (navigator.hardwareConcurrency || 8) <= 4;
    try {
      // Chạy ngoài Angular zone: vòng lặp requestAnimationFrame không kích hoạt change detection mỗi khung hình
      this.engine = await this.zone.runOutsideAngular(async () => {
        const { createCinematicEngine } = await import('./engine/cinematic-engine');
        return createCinematicEngine(this.canvasRef.nativeElement, hud, {
          quality: small || weak ? 'low' : 'high',
          modelUrl: 'models/supercar.glb',
          dracoPath: 'draco/',
        });
      });
    } catch (err) {
      console.warn('Không khởi tạo được cảnh 3D trang chủ:', err);
      this.status.set('error');
      return;
    }
    if (this.disposed) { this.engine.dispose(); this.engine = null; return; }

    this.zone.runOutsideAngular(() => {
      const ro = new ResizeObserver(() => this.engine?.setSize(host.clientWidth, host.clientHeight));
      ro.observe(host);
      const io = new IntersectionObserver(([e]) => { this.inView = e.isIntersecting; this.sync(); }, { threshold: 0.05 });
      io.observe(host);
      const onVis = () => this.sync();
      document.addEventListener('visibilitychange', onVis);
      this.cleanups.push(() => ro.disconnect(), () => io.disconnect(), () => document.removeEventListener('visibilitychange', onVis));
    });
    this.engine.setSize(host.clientWidth, host.clientHeight);
    if (!this.wantPlay) this.engine.showStill();
    this.status.set('ready');
    this.sync();
  }

  /** Nút ▶ / ⏸ (ghi nhớ lựa chọn). */
  toggle(): void {
    this.wantPlay = !this.wantPlay;
    try { localStorage.setItem(MOTION_KEY, this.wantPlay ? 'on' : 'off'); } catch { /* bỏ qua */ }
    this.sync();
  }

  /** Chỉ chạy khi: người xem muốn phát + hero đang trong khung nhìn + tab đang mở. */
  private sync(): void {
    if (!this.engine) return;
    const run = this.wantPlay && this.inView && !document.hidden;
    if (run) this.engine.play(); else this.engine.pause();
    if (this.playing() !== this.wantPlay) this.zone.run(() => this.playing.set(this.wantPlay));
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.cleanups.forEach((f) => f());
    this.engine?.dispose();
    this.engine = null;
  }
}

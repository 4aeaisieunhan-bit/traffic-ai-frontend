import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AnalyzeService, OutputVideoDetails, SampleVideoInfo } from '../core/services/analyze.service';
import { ANALYSIS_STEPS, AnalysisSessionService } from '../core/services/analysis-session.service';
import { PctPipe } from '../core/pipes/pct.pipe';
import { LocationItem, LocationService, apiErrorMessage } from '../core/services/location.service';
import { environment } from '../../environments/environment';

const ALLOWED_EXTS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
@Component({
  selector: 'app-video-analysis',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, PctPipe],
  templateUrl: './video-analysis.html',
  styleUrl: './video-analysis.css',
})
export class VideoAnalysis implements OnInit, OnDestroy {
  private analyzeService = inject(AnalyzeService);
  private locationService = inject(LocationService);
  // Phiên phân tích sống ở cấp ứng dụng: chuyển trang KHÔNG làm mất upload / tiến độ / kết quả
  readonly session = inject(AnalysisSessionService);
  // App chạy zoneless (không có zone.js) nên phải báo Angular cập nhật view sau mỗi callback bất đồng bộ
  private cdr = inject(ChangeDetectorRef);

  // Khung tiến trình: tự cuộn tới khi bắt đầu phân tích
  @ViewChild('progressPanel') progressPanel?: ElementRef<HTMLElement>;
  @ViewChild('locationBox') locationBox?: ElementRef<HTMLElement>;
  locationAttention = false;   // nháy viền khung địa điểm khi bấm phân tích mà chưa chọn
  readonly steps = ANALYSIS_STEPS;

  private readonly defaultVideoUrl = `${environment.apiUrl}/analyze/video/output`;
  staticUrl = environment.staticUrl;

  selectedFile: File | null = null;
  selectedFileName = '';
  selectedFileSize = '';
  fileError = '';

  outputDetails: OutputVideoDetails | null = null;
  loadingDetails = true;

  // Video mẫu trên máy chủ: không có trong Git nên có thể không tồn tại -> ẩn lựa chọn
  sample: SampleVideoInfo | null = null;
  usingSample = false;

  // Địa điểm quay video - bắt buộc khi upload file
  locations: LocationItem[] = [];
  selectedLocationId: number | null = null;
  showNewLocation = false;
  newLocationName = '';
  newLocationAddress = '';
  locationError = '';
  savingLocation = false;

  // ── Trạng thái phiên phân tích (đọc từ service; template giữ nguyên tên cũ) ──
  get phase() { return this.session.phase(); }
  get taskId() { return this.session.taskId(); }
  get taskStatus() { return this.session.taskStatus(); }
  get errorMessage() { return this.session.errorMessage(); }
  get cancelling() { return this.session.cancelling(); }
  get cancelled() { return this.session.cancelled(); }
  get isBusy() { return this.session.isBusy(); }
  get currentStep() { return this.session.currentStep(); }
  get displayPercent() { return this.session.displayPercent(); }
  get statusText() { return this.session.statusText(); }
  get elapsedText() { return this.session.elapsedText(); }
  get etaText() { return this.session.etaText(); }
  get videoUrl() { return this.session.resultVideoUrl() || this.defaultVideoUrl; }

  constructor() {
    // Một lần phân tích vừa hoàn tất (kể cả khi người dùng ở trang khác lúc đó) -> tải lại kết quả mới nhất
    let lastCompleted = this.session.completedCount();
    effect(() => {
      const n = this.session.completedCount();
      if (n !== lastCompleted) {
        lastCompleted = n;
        this.loadOutputDetails();
      }
    });
  }

  private scrollToProgress(): void {
    setTimeout(() => this.progressPanel?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }

  /** Mọi lần phân tích (upload hay video mẫu) đều phải chọn địa điểm. */
  get needsLocation(): boolean {
    return this.selectedLocationId === null;
  }

  ngOnInit(): void {
    this.loadOutputDetails();
    this.loadLocations();
    this.loadSample();
    this.session.resume();   // vừa tải lại trang (F5) mà backend đang phân tích -> hiện lại tiến trình
    if (this.session.phase() !== 'idle' && !this.selectedFileName) this.selectedFileName = this.session.fileName();
  }

  ngOnDestroy(): void {
    // Rời trang sau khi đã xem kết quả -> lần sau vào lại là trang mới; đang phân tích thì vẫn giữ tiến trình
    this.session.leavePage();
  }

  loadLocations(selectId?: number): void {
    this.locationService.list().subscribe({
      next: (data) => {
        this.locations = data;
        if (selectId !== undefined) this.selectedLocationId = selectId;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.locationError = apiErrorMessage(err, 'Không tải được danh sách địa điểm');
        this.cdr.markForCheck();
      },
    });
  }

  private loadSample(): void {
    this.analyzeService.getSampleVideo().subscribe({
      next: (info) => {
        this.sample = info;
        this.cdr.markForCheck();
      },
      error: () => {
        this.sample = { available: false };
        this.cdr.markForCheck();
      },
    });
  }

  /** '3840x2160 · 21 giây' từ thông tin video mẫu. */
  get sampleDescription(): string {
    const s = this.sample;
    if (!s?.available) return '';
    const parts = [];
    if (s.width && s.height) parts.push(`${s.width}x${s.height}`);
    if (s.duration_sec) parts.push(`${Math.round(s.duration_sec)} giây`);
    if (s.file_size_mb) parts.push(`${s.file_size_mb} MB`);
    return parts.join(' · ');
  }

  addLocation(): void {
    const name = this.newLocationName.trim();
    if (!name || this.savingLocation) return;
    this.savingLocation = true;
    this.locationError = '';
    this.locationService.create({ name, address: this.newLocationAddress.trim() || null }).subscribe({
      next: (loc) => {
        this.savingLocation = false;
        this.showNewLocation = false;
        this.newLocationName = '';
        this.newLocationAddress = '';
        this.loadLocations(loc.id);
      },
      error: (err) => {
        this.savingLocation = false;
        this.locationError = apiErrorMessage(err, 'Không thêm được địa điểm');
        this.cdr.markForCheck();
      },
    });
  }

  loadOutputDetails(): void {
    this.loadingDetails = true;
    this.analyzeService.getOutputDetails().subscribe({
      next: (data) => {
        this.outputDetails = data;
        this.loadingDetails = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Lỗi tải chi tiết video output:', err);
        this.loadingDetails = false;
        this.cdr.markForCheck();
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset để chọn lại cùng 1 file vẫn kích hoạt sự kiện change
    input.value = '';
    if (!file) return;

    this.fileError = '';
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      this.fileError = `Định dạng "${ext}" không được hỗ trợ. Chỉ chấp nhận: ${ALLOWED_EXTS.join(', ')}`;
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      this.fileError = 'File vượt quá dung lượng tối đa 2GB';
      return;
    }

    this.selectedFile = file;
    this.usingSample = false;
    this.selectedFileName = file.name;
    this.selectedFileSize = this.formatSize(file.size);
  }

  selectSampleVideo(): void {
    if (!this.sample?.available) return;
    this.selectedFile = null;
    this.usingSample = true;
    this.fileError = '';
    this.selectedFileName = this.sample.name ?? '';
    this.selectedFileSize = 'video mẫu có sẵn trên máy chủ';
  }

  startAnalysis(): void {
    if (this.isBusy) return;
    if (!this.selectedFile && !this.usingSample) {
      this.fileError = this.sample?.available
        ? 'Vui lòng chọn video từ máy tính hoặc bấm "Dùng video mẫu"'
        : 'Vui lòng chọn video từ máy tính';
      this.cdr.markForCheck();
      return;
    }
    if (this.needsLocation) {
      // Hướng dẫn rõ ràng thay vì "bấm không có phản ứng"
      this.locationError = this.locations.length
        ? 'Vui lòng chọn địa điểm quay video trong danh sách trước khi phân tích'
        : 'Chưa có địa điểm nào: nhập tên địa điểm vào ô phía trên rồi bấm "Lưu & chọn", sau đó bấm Bắt Đầu Phân Tích lại';
      if (!this.locations.length) this.showNewLocation = true;
      this.locationAttention = false;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.locationAttention = true;   // bật lại class để animation chạy lại mỗi lần bấm
        this.cdr.markForCheck();
        const box = this.locationBox?.nativeElement;
        box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (box?.querySelector(this.locations.length ? '#location-select' : 'input') as HTMLElement | null)?.focus({ preventScroll: true });
      }, 30);
      return;
    }
    this.locationAttention = false;
    this.locationError = '';
    // Không gửi file = backend dùng video mẫu
    this.session.start(this.selectedFile || undefined, this.selectedLocationId, this.selectedFileName);
    this.scrollToProgress();
  }

  /** Huỷ lần phân tích đang chờ / đang chạy trên máy chủ. */
  cancelAnalysis(): void {
    if (this.phase !== 'analyzing' || this.cancelling) return;
    if (!confirm('Huỷ lần phân tích này? Kết quả dở dang sẽ bị loại bỏ.')) return;
    this.session.cancelAnalysis((msg) => alert(msg));
  }

  cancelUpload(): void {
    this.session.cancelUpload();
  }

  private formatSize(bytes: number): string {
    return bytes >= 1024 * 1024 * 1024
      ? `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Số vi phạm của lần phân tích gần nhất theo trạng thái duyệt. */
  latestRunCount(status: string): number {
    return this.outputDetails?.violations.filter((v) => v.status === status).length ?? 0;
  }

  getModelKeys(): string[] {
    return this.outputDetails?.model_stats ? Object.keys(this.outputDetails.model_stats) : [];
  }
}

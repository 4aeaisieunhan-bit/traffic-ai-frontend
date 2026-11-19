import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocationItem, LocationService, apiErrorMessage } from '../core/services/location.service';

interface LocationForm {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

const EMPTY_FORM: LocationForm = { name: '', address: '', latitude: null, longitude: null };

@Component({
  selector: 'app-locations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './locations.html',
  styleUrl: './locations.css',
})
export class Locations implements OnInit {
  private locationService = inject(LocationService);
  // App chạy zoneless nên phải báo Angular cập nhật view sau mỗi callback bất đồng bộ
  private cdr = inject(ChangeDetectorRef);

  locations: LocationItem[] = [];
  loading = true;

  form: LocationForm = { ...EMPTY_FORM };
  editingId: number | null = null;
  saving = false;

  errorMessage = '';
  successMessage = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.locationService.list().subscribe({
      next: (data) => {
        this.locations = data;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMessage = apiErrorMessage(err, 'Không tải được danh sách địa điểm');
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  startEdit(loc: LocationItem): void {
    this.editingId = loc.id;
    this.form = {
      name: loc.name,
      address: loc.address ?? '',
      latitude: loc.latitude,
      longitude: loc.longitude,
    };
    this.clearMessages();
  }

  cancelEdit(): void {
    this.editingId = null;
    this.form = { ...EMPTY_FORM };
    this.clearMessages();
  }

  save(): void {
    const name = this.form.name.trim();
    if (!name || this.saving) return;
    this.saving = true;
    this.clearMessages();

    const payload = {
      name,
      address: this.form.address.trim() || null,
      latitude: this.form.latitude ?? null,
      longitude: this.form.longitude ?? null,
    };
    const request =
      this.editingId === null
        ? this.locationService.create(payload)
        : this.locationService.update(this.editingId, payload);

    request.subscribe({
      next: (loc) => {
        this.successMessage = this.editingId === null ? `Đã thêm địa điểm "${loc.name}"` : `Đã cập nhật "${loc.name}"`;
        this.saving = false;
        this.editingId = null;
        this.form = { ...EMPTY_FORM };
        this.load();
      },
      error: (err) => {
        this.errorMessage = apiErrorMessage(err, 'Không lưu được địa điểm');
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  remove(loc: LocationItem): void {
    if (loc.video_count > 0) return;
    if (!confirm(`Xóa địa điểm "${loc.name}"?`)) return;
    this.clearMessages();
    this.locationService.delete(loc.id).subscribe({
      next: () => {
        this.successMessage = `Đã xóa địa điểm "${loc.name}"`;
        if (this.editingId === loc.id) this.cancelEdit();
        this.load();
      },
      error: (err) => {
        this.errorMessage = apiErrorMessage(err, 'Không xóa được địa điểm');
        this.cdr.markForCheck();
      },
    });
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }
}

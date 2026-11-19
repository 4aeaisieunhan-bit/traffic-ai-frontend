import { Pipe, PipeTransform } from '@angular/core';

/** Hiển thị phần trăm; backend trả null khi mô hình không cung cấp điểm -> '—' (không bịa số). */
@Pipe({ name: 'pct', standalone: true })
export class PctPipe implements PipeTransform {
  transform(value: number | null | undefined, digits = 1, scale = 1): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return `${(value * scale).toFixed(digits)}%`;
  }
}

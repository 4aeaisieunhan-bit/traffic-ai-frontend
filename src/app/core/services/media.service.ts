// src/app/core/services/media.service.ts
// Mở / tải ảnh bằng chứng và video của backend (/static/...) trong TAB MỚI hoặc dưới dạng file tải về.
//
// Không dùng link thẳng <a href="https://backend/static/..." target="_blank">: khi frontend (Vercel) và backend
// (tunnel) khác tên miền, cookie xem media là cookie "bên thứ ba" dạng phân vùng (Partitioned) — chỉ được gửi
// khi trang đang mở là frontend. Tab mới mở thẳng backend thì không có cookie -> 401. Thuộc tính `download`
// cũng bị trình duyệt bỏ qua với link khác tên miền.
// => Tải file qua HttpClient (interceptor gắn token), rồi mở / lưu bản blob cùng tên miền với frontend.
// Ảnh / video hiển thị ngay trong trang (<img>, <video>) vẫn dùng URL trực tiếp vì cookie được gửi bình thường.
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const BLOB_URL_TTL_MS = 5 * 60_000;

@Injectable({ providedIn: 'root' })
export class MediaService {
  private http = inject(HttpClient);

  /** '/static/evidence/x.jpg' -> URL đầy đủ tới backend (dùng cho <img>, <video>). */
  url(path: string): string {
    return `${environment.staticUrl}${path}`;
  }

  fetch(path: string): Observable<Blob> {
    return this.http.get(this.url(path), { responseType: 'blob' });
  }

  /** Mở file trong tab mới. Tab được mở NGAY lúc bấm (tránh bị chặn popup), nội dung nạp sau. */
  open(path: string): void {
    const win = window.open('', '_blank');
    this.fetch(path).subscribe({
      next: (blob) => {
        const blobUrl = URL.createObjectURL(blob);
        if (win) win.location.href = blobUrl;
        else window.location.href = blobUrl;
        setTimeout(() => URL.revokeObjectURL(blobUrl), BLOB_URL_TTL_MS);
      },
      error: () => {
        win?.close();
        alert('Không mở được tệp. Phiên đăng nhập có thể đã hết hạn hoặc tệp không còn trên máy chủ.');
      },
    });
  }

  /** Tải file về máy với tên file gợi ý (mặc định lấy từ đường dẫn). */
  download(path: string, fileName = path.split('/').pop() || 'tep-tin'): void {
    this.fetch(path).subscribe({
      next: (blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      },
      error: () => alert('Không tải được tệp. Phiên đăng nhập có thể đã hết hạn hoặc tệp không còn trên máy chủ.'),
    });
  }
}

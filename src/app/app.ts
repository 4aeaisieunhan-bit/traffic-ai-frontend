// signal là một cơ chế của Angular dùng để lưu trữ dữ liệu có thể thay đổi và theo dõi sự thay đổi đó.

import { Component, signal } from '@angular/core';
// Lấy RouterOutlet từ thư viện Angular Router.
import { RouterOutlet } from '@angular/router';

@Component({
  imports: [
    RouterOutlet,
  
  ],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('traffic-ai-frontend');
}

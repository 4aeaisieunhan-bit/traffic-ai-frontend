import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  selector: 'app-hompage',
  styleUrl: './hompage.css',
  templateUrl: './hompage.html',
})
export class Hompage {
  readonly year = new Date().getFullYear();
}

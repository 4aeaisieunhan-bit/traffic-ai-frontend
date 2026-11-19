import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {HeaderComponent} from './header/header.component';
import {SidebarComponent} from './sidebar/sidebar.component';
import { SystemService } from '../core/services/system.service';


@Component({
  imports: [RouterOutlet, HeaderComponent, SidebarComponent],
  selector: 'app-layout',
  styleUrl: './layout.css',
  templateUrl: './layout.html',
})
export class Layout implements OnInit, OnDestroy {
  private system = inject(SystemService);
  ngOnInit(): void { this.system.start(); }
  ngOnDestroy(): void { this.system.stop(); }
}

import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthSession } from '../../features/authentication/public-api';

@Component({
  selector: 'app-shell',
  imports: [DatePipe, RouterLink, RouterLinkActive, RouterOutlet],
  styleUrl: './shell.component.css',
  templateUrl: './shell.component.html',
})
export class ShellComponent {
  readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly navigation = toSignal(
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)),
  );
  readonly today = new Date();
  readonly title = computed(() => {
    this.navigation();
    let current = this.route.snapshot;
    while (current.firstChild) current = current.firstChild;
    return current.data['title'] ?? 'Medical Store';
  });
  logout(): void {
    this.session.clear();
    void this.router.navigateByUrl('/login');
  }
}

import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { AuthSession } from './auth-session';
import { AuthenticationApi } from './authentication.api';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule],
  styleUrl: './login.page.css',
  templateUrl: './login.page.html',
})
export class LoginPage extends PageFeedback implements OnInit {
  private readonly api = inject(AuthenticationApi);
  private readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  credentials = { email: '', password: '' };
  ngOnInit(): void {
    if (this.session.isAuthenticated()) void this.router.navigateByUrl('/reports');
  }
  login(): Promise<void> {
    return this.perform(async () => {
      try {
        const result = await this.api.login(this.credentials);
        this.session.accept(result);
        this.credentials.password = '';
        const url = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/reports';
        await this.router.navigateByUrl(
          url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/login')
            ? url
            : '/reports',
        );
      } catch (error) {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.message.set('Email or password is incorrect.');
          this.hasError.set(true);
        } else throw error;
      }
    });
  }
}

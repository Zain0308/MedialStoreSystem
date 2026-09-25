import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-notice',
  template: `
    @if (message()) {
      <div class="notice" [class.error]="error()" role="status">{{ message() }}</div>
    }
    @if (busy()) {
      <p class="loading-note" role="status">Loading…</p>
    }
  `,
})
export class PageNoticeComponent {
  readonly message = input('');
  readonly error = input(false);
  readonly busy = input(false);
}

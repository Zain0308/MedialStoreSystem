import { signal } from '@angular/core';
import { apiErrorMessage } from '../../core/api/api-errors';

/** Per-page feedback only. Business data belongs to its feature. */
export class PageFeedback {
  readonly busy = signal(false);
  readonly message = signal('');
  readonly hasError = signal(false);
  protected async perform(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    this.hasError.set(false);
    try {
      await action();
    } catch (error) {
      this.message.set(apiErrorMessage(error));
      this.hasError.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}

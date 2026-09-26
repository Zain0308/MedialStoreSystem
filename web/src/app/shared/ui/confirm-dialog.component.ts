import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    <div class="confirm-dialog-backdrop" (click)="cancelled.emit()">
      <section class="confirm-dialog panel" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title"
        (click)="$event.stopPropagation()">
        <div class="panel-head">
          <div><h3 id="confirm-dialog-title">{{ title }}</h3><p>{{ message }}</p></div>
          <button type="button" class="text-button" aria-label="Close confirmation" [disabled]="busy" (click)="cancelled.emit()">Close</button>
        </div>
        <div class="form-actions">
          <button type="button" class="primary" [disabled]="busy" (click)="confirmed.emit()">{{ confirmLabel }}</button>
          <button type="button" class="text-button" [disabled]="busy" (click)="cancelled.emit()">Cancel</button>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .confirm-dialog-backdrop { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center; padding: 20px; background: rgba(17, 38, 29, .48); }
    .confirm-dialog { width: min(100%, 440px); box-shadow: 0 22px 70px rgba(20, 40, 30, .24); }
    .confirm-dialog .panel-head { align-items: flex-start; }
    .confirm-dialog .panel-head p { margin: 6px 0 0; color: #62776d; font-size: 13px; line-height: 1.55; }
    .confirm-dialog .form-actions { display: flex; align-items: center; gap: 12px; margin-top: 20px; }
  `],
})
export class ConfirmDialogComponent {
  @Input() title = 'Confirm action';
  @Input() message = 'Are you sure you want to continue?';
  @Input() confirmLabel = 'Confirm';
  @Input() busy = false;
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
}

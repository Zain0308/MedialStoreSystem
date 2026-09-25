import { CommonModule } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface SearchPickerOption {
  value: number;
  label: string;
  detail?: string;
  searchText?: string;
}

@Component({
  selector: 'app-search-picker',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="search-picker">
      <div class="search-picker-input">
        <input [attr.aria-label]="ariaLabel()" [placeholder]="placeholder()" autocomplete="off"
          [ngModel]="displayText()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="search($event)" />
        @if (value() !== null) { <button type="button" class="search-picker-clear" [attr.aria-label]="'Clear ' + ariaLabel()" (click)="clear()">×</button> }
      </div>
      @if (selectedOption()?.detail) { <small class="search-picker-selected-detail">{{ selectedOption()?.detail }}</small> }
      @if (matches().length) {
        <div class="search-picker-results" role="listbox" [attr.aria-label]="ariaLabel() + ' results'">
          @for (option of matches(); track option.value) {
            <button type="button" role="option" class="search-picker-option" (click)="select(option)">
              <strong>{{ option.label }}</strong>@if (option.detail) { <small>{{ option.detail }}</small> }
            </button>
          }
        </div>
      } @else if (query().trim()) { <small class="search-picker-empty">No matching items.</small> }
    </div>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .search-picker { position: relative; }
    .search-picker-input { position: relative; }
    .search-picker-input input { width: 100%; padding-right: 32px; }
    .search-picker-clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); padding: 0 4px; border: 0; background: transparent; color: #68877a; font-size: 20px; }
    .search-picker-results { position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; right: 0; max-height: 220px; overflow-y: auto; border: 1px solid #dae9df; border-radius: 8px; background: #fff; box-shadow: 0 8px 20px #17392c1c; }
    .search-picker-option { display: flex; flex-direction: column; align-items: flex-start; width: 100%; gap: 3px; padding: 10px 12px; border: 0; border-bottom: 1px solid #eef1ee; background: #fff; color: #203f36; text-align: left; }
    .search-picker-option:hover, .search-picker-option:focus { background: #f5fbf6; }
    .search-picker-option small, .search-picker-empty, .search-picker-selected-detail { color: #829790; font-size: 11px; }
    .search-picker-empty { display: block; margin-top: 5px; }
    .search-picker-selected-detail { display: block; margin-top: 4px; }
  `],
})
export class SearchPickerComponent {
  readonly options = input<SearchPickerOption[]>([]);
  readonly value = input<number | null>(null);
  readonly valueChange = output<number | null>();
  readonly ariaLabel = input('Search items');
  readonly placeholder = input('Type to search');
  readonly query = signal('');
  readonly selectedOption = computed(() => this.options().find(option => option.value === this.value()) ?? null);
  readonly displayText = computed(() => this.query() || this.selectedOption()?.label || '');
  readonly matches = computed(() => {
    const term = this.query().trim().toLocaleLowerCase();
    if (!term) return [];
    const selected = this.selectedOption();
    if (selected?.label.toLocaleLowerCase() === term) return [];
    return this.options().filter(option => `${option.label} ${option.detail ?? ''} ${option.searchText ?? ''}`
      .toLocaleLowerCase().includes(term)).slice(0, 10);
  });

  search(value: string): void {
    this.query.set(value);
    const selected = this.selectedOption();
    if (!selected || value.toLocaleLowerCase() !== selected.label.toLocaleLowerCase()) this.valueChange.emit(null);
  }
  select(option: SearchPickerOption): void { this.query.set(option.label); this.valueChange.emit(option.value); }
  clear(): void { this.query.set(''); this.valueChange.emit(null); }
}

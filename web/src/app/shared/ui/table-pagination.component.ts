import { Component, computed, input, output } from '@angular/core';

export const TABLE_PAGE_SIZE = 20;

export function pageSlice<T>(rows: readonly T[], page: number, pageSize = TABLE_PAGE_SIZE): T[] {
  const start = Math.max(0, page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

@Component({
  selector: 'app-table-pagination',
  template: `
    @if (total() > 0) {
      <nav class="table-pagination" aria-label="Table pages">
        <span>Showing {{ start() }}–{{ end() }} of {{ total() }}</span>
        <div>
          <button type="button" [disabled]="page() <= 1" (click)="pageChange.emit(page() - 1)">Previous</button>
          <span>Page {{ page() }} of {{ pageCount() }}</span>
          <button type="button" [disabled]="page() >= pageCount()" (click)="pageChange.emit(page() + 1)">Next</button>
        </div>
      </nav>
    }
  `,
  styles: `
    .table-pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 2px;color:#738079;font-size:12px}
    .table-pagination div{display:flex;align-items:center;gap:10px}
    .table-pagination button{border:1px solid #dfe4ec;background:#fff;border-radius:7px;padding:7px 10px;color:#16453d;cursor:pointer}
    .table-pagination button:disabled{opacity:.45;cursor:not-allowed}
    @media(max-width:520px){.table-pagination{align-items:flex-start;flex-direction:column}}
  `,
})
export class TablePaginationComponent {
  readonly page = input(1);
  readonly total = input(0);
  readonly pageSize = input(TABLE_PAGE_SIZE);
  readonly pageChange = output<number>();
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly start = computed(() => this.total() ? (this.page() - 1) * this.pageSize() + 1 : 0);
  readonly end = computed(() => Math.min(this.page() * this.pageSize(), this.total()));
}

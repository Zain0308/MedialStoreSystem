import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ImportsApi } from './imports.api';
import { ImportFilePayload, ImportPreview, ImportPreviewRow, ImportResult } from './imports.models';
import { PageFeedback } from '../../shared/ui/page-feedback';
import { PageNoticeComponent } from '../../shared/ui/page-notice.component';
import { pageSlice, TABLE_PAGE_SIZE, TablePaginationComponent } from '../../shared/ui/table-pagination.component';

@Component({
  selector: 'app-imports-page',
  imports: [CommonModule, FormsModule, PageNoticeComponent, TablePaginationComponent],
  templateUrl: './imports.page.html',
  styleUrl: './imports.page.css',
})
export class ImportsPage extends PageFeedback {
  private readonly api = inject(ImportsApi);
  readonly selectedFile = signal<File | null>(null);
  readonly preview = signal<ImportPreview | null>(null);
  readonly filePayload = signal<ImportFilePayload | null>(null);
  readonly importResult = signal<ImportResult | null>(null);
  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = TABLE_PAGE_SIZE;
  readonly filteredRows = computed(() => {
    const rows = this.preview()?.rows ?? [];
    const term = this.search().trim().toLocaleLowerCase();
    return rows.filter(row => !term || [row.medicineName, row.supplierName, ...row.errors, ...row.warnings]
      .some(value => value.toLocaleLowerCase().includes(term)));
  });
  readonly visibleRows = computed(() => pageSlice(this.filteredRows(), this.page()));

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedFile.set(file);
    this.filePayload.set(null);
    this.preview.set(null);
    this.importResult.set(null);
    this.search.set('');
    this.page.set(1);
    this.message.set('');
    if (file && file.size > 8 * 1024 * 1024) {
      this.selectedFile.set(null);
      input.value = '';
      this.message.set('Choose a file smaller than 8 MB.');
      this.hasError.set(true);
    }
  }

  downloadTemplate(): Promise<void> {
    return this.perform(async () => {
      const blob = await this.api.template();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'medical-store-import-template.csv'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.message.set('Excel-compatible template downloaded. Fill it in Excel, then save as .xlsx or .csv.');
    });
  }

  previewImport(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return Promise.resolve();
    return this.perform(async () => {
      const payload = { fileName: file.name, fileContentBase64: await this.toBase64(file) };
      const preview = await this.api.preview(payload);
      this.filePayload.set(payload);
      this.preview.set(preview);
      this.importResult.set(null);
      this.search.set('');
      this.page.set(1);
      this.message.set(preview.errorCount
        ? `Preview ready: ${preview.readyCount} rows can be imported; ${preview.errorCount} need correction.`
        : `Preview ready: all ${preview.rowCount} rows can be imported.`);
      this.hasError.set(preview.errorCount > 0);
    });
  }

  confirmImport(): Promise<void> {
    const payload = this.filePayload();
    const preview = this.preview();
    if (!payload || !preview || preview.errorCount > 0) return Promise.resolve();
    return this.perform(async () => {
      const result = await this.api.commit(payload);
      this.importResult.set(result);
      this.preview.set(null);
      this.filePayload.set(null);
      this.selectedFile.set(null);
      this.message.set(`Import complete: ${result.createdMedicines} medicines, ${result.createdSuppliers} suppliers and ${result.unitsAdded} opening units added.`);
      this.hasError.set(false);
    });
  }

  rowStatus(row: ImportPreviewRow): string { return row.errors.length ? 'Needs changes' : row.warnings.length ? 'Review' : 'Ready'; }

  private async toBase64(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    return btoa(binary);
  }
}

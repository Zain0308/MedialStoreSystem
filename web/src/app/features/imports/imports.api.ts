import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { ImportFilePayload, ImportPreview, ImportResult } from './imports.models';

@Injectable({ providedIn: 'root' })
export class ImportsApi {
  private readonly api = inject(ApiClient);
  template() { return this.api.getBlob('/imports/template'); }
  preview(file: ImportFilePayload) { return this.api.post<ImportPreview>('/imports/preview', file); }
  commit(file: ImportFilePayload) { return this.api.post<ImportResult>('/imports/commit', file); }
}

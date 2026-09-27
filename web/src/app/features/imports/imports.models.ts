export interface ImportFilePayload { fileName: string; fileContentBase64: string; }
export interface ImportPreviewRow {
  rowNumber: number;
  medicineName: string;
  supplierName: string;
  openingQuantity: number;
  errors: string[];
  warnings: string[];
}
export interface ImportPreview {
  rowCount: number;
  readyCount: number;
  errorCount: number;
  rows: ImportPreviewRow[];
}
export interface ImportResult {
  createdMedicines: number;
  createdSuppliers: number;
  openingBatches: number;
  unitsAdded: number;
}

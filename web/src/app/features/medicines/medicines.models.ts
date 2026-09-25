export interface Medicine {
  id: number;
  name: string;
  genericName?: string;
  barcode?: string;
  stock: number;
  minimumStock: number;
  requiresPrescription: boolean;
  isActive: boolean;
}
export interface CreateMedicine {
  name: string;
  genericName: string;
  barcode: string;
  minimumStock: number;
  requiresPrescription: boolean;
}

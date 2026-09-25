export interface Medicine {
  id: number;
  name: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  manufacturer?: string;
  description?: string;
  barcode?: string;
  stock: number;
  minimumStock: number;
  requiresPrescription: boolean;
  isActive: boolean;
}
export interface SaveMedicine {
  name: string;
  genericName: string;
  barcode: string;
  minimumStock: number;
  requiresPrescription: boolean;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  description: string;
}

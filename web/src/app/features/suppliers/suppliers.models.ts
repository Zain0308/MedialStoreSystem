export interface Supplier {
  id: number;
  name: string;
  phone?: string;
}
export interface CreateSupplier {
  name: string;
  phone: string;
}

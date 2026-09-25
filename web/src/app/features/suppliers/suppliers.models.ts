export interface Supplier {
  id: number;
  name: string;
  phone?: string;
  contactPerson?: string;
  email?: string;
  address?: string;
  isActive: boolean;
}
export interface CreateSupplier {
  name: string;
  phone: string;
  contactPerson?: string;
  email?: string;
  address?: string;
}

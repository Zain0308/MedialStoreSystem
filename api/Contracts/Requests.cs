namespace MedicalStore.Api;

public sealed record LoginRequest(string Email, string Password);
public sealed record MedicineRequest(string Name, string? GenericName, string? Barcode, int MinimumStock, bool RequiresPrescription);
public sealed record SupplierRequest(string Name, string? Phone);
public sealed record PurchaseRequest(long SupplierId, string SupplierInvoice, List<PurchaseRequestLine> Lines);
public sealed record PurchaseRequestLine(long MedicineId, string BatchNumber, DateOnly ExpiryDate, int Quantity, decimal CostPrice, decimal SalePrice);
public sealed record SaleRequest(List<SaleRequestLine> Lines, decimal CashReceived);
public sealed record SaleRequestLine(long MedicineId, int Quantity);

namespace MedicalStore.Api.Modules.Purchases;

public sealed record PurchaseRequestLine(long MedicineId, string BatchNumber, DateOnly ExpiryDate, int Quantity, decimal CostPrice, decimal SalePrice);

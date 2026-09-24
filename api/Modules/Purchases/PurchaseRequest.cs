namespace MedicalStore.Api.Modules.Purchases;

public sealed record PurchaseRequest(long SupplierId, string SupplierInvoice, List<PurchaseRequestLine> Lines);

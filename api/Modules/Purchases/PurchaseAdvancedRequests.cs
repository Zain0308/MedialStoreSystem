namespace MedicalStore.Api.Modules.Purchases;

public sealed record PurchaseReturnRequest(string SupplierReference, string Reason, List<PurchaseReturnLineRequest> Lines);
public sealed record PurchaseReturnLineRequest(long PurchaseLineId, int Quantity);
public sealed record PurchaseCorrectionRequest(string Reason, List<PurchaseCorrectionLineRequest> Lines);
public sealed record PurchaseCorrectionLineRequest(long PurchaseLineId, int CorrectedQuantity);
public sealed record SupplierPaymentRequest(decimal Amount, string Method, string? Reference);

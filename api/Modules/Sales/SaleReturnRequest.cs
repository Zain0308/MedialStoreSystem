namespace MedicalStore.Api.Modules.Sales;

public sealed record SaleReturnRequest(string Reason, string RefundMethod, List<SaleReturnLineRequest> Lines);
public sealed record SaleReturnLineRequest(long SaleLineId, int Quantity, bool Restock);

namespace MedicalStore.Api.Modules.Sales;

public sealed record SaleRequest(List<SaleRequestLine> Lines, decimal CashReceived);

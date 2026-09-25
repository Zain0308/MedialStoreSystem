namespace MedicalStore.Api.Modules.Sales;

public sealed record SaleRequest(List<SaleRequestLine> Lines, decimal CashReceived, decimal DiscountAmount = 0, string PaymentMethod = "Cash", long? CustomerId = null);

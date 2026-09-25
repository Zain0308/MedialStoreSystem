using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Customers;

namespace MedicalStore.Api.Modules.Sales;

public sealed class Sale : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public string InvoiceNumber { get; set; } = "PENDING";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public decimal Total { get; set; }
    public decimal Subtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public string PaymentMethod { get; set; } = "Cash";
    public long? CustomerId { get; set; }
    public decimal CashReceived { get; set; }
    public string CashierId { get; set; } = "";
    public List<SaleLine> Lines { get; set; } = [];
    public List<SaleReturn> Returns { get; set; } = [];
}

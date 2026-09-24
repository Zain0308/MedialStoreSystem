
namespace MedicalStore.Api.Modules.Sales;

public sealed class Sale
{
    public long Id { get; set; }
    public string InvoiceNumber { get; set; } = "PENDING";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public decimal Total { get; set; }
    public decimal CashReceived { get; set; }
    public string CashierId { get; set; } = "";
    public List<SaleLine> Lines { get; set; } = [];
}

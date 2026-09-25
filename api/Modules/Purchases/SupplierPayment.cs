namespace MedicalStore.Api.Modules.Purchases;

public sealed class SupplierPayment
{
    public long Id { get; set; }
    public long PurchaseId { get; set; }
    public Purchase Purchase { get; set; } = null!;
    public decimal Amount { get; set; }
    public string Method { get; set; } = "Cash";
    public string? Reference { get; set; }
    public DateTimeOffset PaidAt { get; set; } = DateTimeOffset.UtcNow;
}

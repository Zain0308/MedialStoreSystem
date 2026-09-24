using MedicalStore.Api.Modules.Suppliers;

namespace MedicalStore.Api.Modules.Purchases;

public sealed class Purchase
{
    public long Id { get; set; }
    public long SupplierId { get; set; }
    public Supplier Supplier { get; set; } = null!;
    public required string SupplierInvoice { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public decimal Total { get; set; }
    public List<PurchaseLine> Lines { get; set; } = [];
}

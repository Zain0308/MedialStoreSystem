using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Suppliers;

namespace MedicalStore.Api.Modules.Purchases;

public sealed class Purchase : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public long SupplierId { get; set; }
    public Supplier Supplier { get; set; } = null!;
    public required string SupplierInvoice { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public decimal Total { get; set; }
    public List<PurchaseLine> Lines { get; set; } = [];
    public List<PurchaseReturn> Returns { get; set; } = [];
    public List<SupplierPayment> Payments { get; set; } = [];
    public List<PurchaseCorrection> Corrections { get; set; } = [];
}

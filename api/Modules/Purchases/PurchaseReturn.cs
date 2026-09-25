using MedicalStore.Api.Infrastructure.Persistence;
namespace MedicalStore.Api.Modules.Purchases;

public sealed class PurchaseReturn : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public long PurchaseId { get; set; }
    public Purchase Purchase { get; set; } = null!;
    public string SupplierReference { get; set; } = "";
    public string Reason { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public decimal Total { get; set; }
    public List<PurchaseReturnLine> Lines { get; set; } = [];
}

public sealed class PurchaseReturnLine : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public long PurchaseReturnId { get; set; }
    public PurchaseReturn PurchaseReturn { get; set; } = null!;
    public long PurchaseLineId { get; set; }
    public PurchaseLine PurchaseLine { get; set; } = null!;
    public long BatchId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitCost { get; set; }
}

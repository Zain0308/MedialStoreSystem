using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Inventory;

namespace MedicalStore.Api.Modules.Purchases;

public sealed class PurchaseLine : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public long PurchaseId { get; set; }
    public long BatchId { get; set; }
    public Batch Batch { get; set; } = null!;
    public int Quantity { get; set; }
    public decimal UnitCost { get; set; }
    public int ReturnedQuantity { get; set; }
}

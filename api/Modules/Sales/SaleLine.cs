using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Inventory;

namespace MedicalStore.Api.Modules.Sales;

public sealed class SaleLine : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public long SaleId { get; set; }
    public long BatchId { get; set; }
    public Batch Batch { get; set; } = null!;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal UnitCost { get; set; }
    public decimal DiscountAmount { get; set; }
    public int ReturnedQuantity { get; set; }
}

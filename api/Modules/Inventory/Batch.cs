using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Medicines;

namespace MedicalStore.Api.Modules.Inventory;

public sealed class Batch : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public long MedicineId { get; set; }
    public Medicine Medicine { get; set; } = null!;
    public required string Number { get; set; }
    public DateOnly ExpiryDate { get; set; }
    public decimal CostPrice { get; set; }
    public decimal SalePrice { get; set; }
    public int Quantity { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

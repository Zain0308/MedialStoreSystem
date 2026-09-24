
namespace MedicalStore.Api.Modules.Inventory;

public sealed class StockMovement
{
    public long Id { get; set; }
    public long BatchId { get; set; }
    public string Type { get; set; } = "";
    public long ReferenceId { get; set; }
    public int QuantityChange { get; set; }
    public int BalanceAfter { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

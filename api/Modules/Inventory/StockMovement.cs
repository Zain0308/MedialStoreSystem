using MedicalStore.Api.Infrastructure.Persistence;

namespace MedicalStore.Api.Modules.Inventory;

public sealed class StockMovement : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public long BatchId { get; set; }
    public Batch Batch { get; set; } = null!;
    public string Type { get; set; } = "";
    public long ReferenceId { get; set; }
    public int QuantityChange { get; set; }
    public int BalanceAfter { get; set; }
    public string Reason { get; set; } = "";
    public string? ActorId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

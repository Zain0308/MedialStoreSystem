using MedicalStore.Api.Infrastructure.Persistence;

namespace MedicalStore.Api.Modules.Purchases;

public sealed class PurchaseCorrection : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public long PurchaseId { get; set; }
    public Purchase Purchase { get; set; } = null!;
    public string Reason { get; set; } = "";
    public string? ActorId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public decimal PreviousTotal { get; set; }
    public decimal CorrectedTotal { get; set; }
    public List<PurchaseCorrectionLine> Lines { get; set; } = [];
}

public sealed class PurchaseCorrectionLine : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public long PurchaseCorrectionId { get; set; }
    public PurchaseCorrection PurchaseCorrection { get; set; } = null!;
    public long PurchaseLineId { get; set; }
    public PurchaseLine PurchaseLine { get; set; } = null!;
    public int PreviousQuantity { get; set; }
    public int CorrectedQuantity { get; set; }
    public int QuantityChange { get; set; }
}

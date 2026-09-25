using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Inventory;

namespace MedicalStore.Api.Modules.Medicines;

public sealed class Medicine : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public required string Name { get; set; }
    public string? GenericName { get; set; }
    public string? Barcode { get; set; }
    public string? Strength { get; set; }
    public string? DosageForm { get; set; }
    public string? Manufacturer { get; set; }
    public string? Description { get; set; }
    public bool RequiresPrescription { get; set; }
    public int MinimumStock { get; set; }
    public bool IsActive { get; set; } = true;
    public List<Batch> Batches { get; set; } = [];
}

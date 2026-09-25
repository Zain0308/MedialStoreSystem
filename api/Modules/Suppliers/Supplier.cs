using MedicalStore.Api.Infrastructure.Persistence;

namespace MedicalStore.Api.Modules.Suppliers;

public sealed class Supplier : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public required string Name { get; set; }
    public string? Phone { get; set; }
    public string? ContactPerson { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
}

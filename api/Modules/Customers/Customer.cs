using MedicalStore.Api.Infrastructure.Persistence;

namespace MedicalStore.Api.Modules.Customers;

public sealed class Customer : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public required string Name { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public decimal CreditLimit { get; set; }
    public bool IsActive { get; set; } = true;
}

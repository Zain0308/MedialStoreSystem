using MedicalStore.Api.Infrastructure.Persistence;

namespace MedicalStore.Api.Modules.Customers;

public sealed class CustomerPayment : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public long CustomerId { get; set; }
    public long SaleId { get; set; }
    public decimal Amount { get; set; }
    public required string Method { get; set; }
    public string? Reference { get; set; }
    public DateTimeOffset PaidAt { get; set; } = DateTimeOffset.UtcNow;
}

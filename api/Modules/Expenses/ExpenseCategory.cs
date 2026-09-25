using MedicalStore.Api.Infrastructure.Persistence;

namespace MedicalStore.Api.Modules.Expenses;

public sealed class ExpenseCategory : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public required string Name { get; set; }
    public bool IsActive { get; set; } = true;
}

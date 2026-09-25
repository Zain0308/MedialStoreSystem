using MedicalStore.Api.Infrastructure.Persistence;

namespace MedicalStore.Api.Modules.Expenses;

public sealed class Expense : IStoreScoped
{
    public long StoreId { get; set; }
    public long Id { get; set; }
    public long CategoryId { get; set; }
    public required string Description { get; set; }
    public decimal Amount { get; set; }
    public DateOnly ExpenseDate { get; set; }
    public required string PaymentMethod { get; set; }
    public string? Reference { get; set; }
    public string? Notes { get; set; }
    public string ActorId { get; set; } = "";
}

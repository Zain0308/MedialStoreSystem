using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MedicalStore.Api.Modules.Expenses;

public sealed class ExpenseCategoryConfiguration : IEntityTypeConfiguration<ExpenseCategory>
{
    public void Configure(EntityTypeBuilder<ExpenseCategory> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(100);
        builder.HasIndex(x => new { x.StoreId, x.Name }).IsUnique();
    }
}

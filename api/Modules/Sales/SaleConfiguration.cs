using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MedicalStore.Api.Modules.Sales;

public sealed class SaleConfiguration : IEntityTypeConfiguration<Sale>
{
    public void Configure(EntityTypeBuilder<Sale> builder)
    {
        builder.Property(x => x.Total).HasPrecision(18, 2);
        builder.Property(x => x.CashReceived).HasPrecision(18, 2);
        builder.HasIndex(x => x.InvoiceNumber).IsUnique();
    }
}

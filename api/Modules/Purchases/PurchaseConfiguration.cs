using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MedicalStore.Api.Modules.Purchases;

public sealed class PurchaseConfiguration : IEntityTypeConfiguration<Purchase>
{
    public void Configure(EntityTypeBuilder<Purchase> builder)
    {
        builder.Property(x => x.SupplierInvoice).HasMaxLength(100);
        builder.Property(x => x.Total).HasPrecision(18, 2);
        builder.HasIndex(x => new { x.StoreId, x.SupplierId, x.SupplierInvoice }).IsUnique();
    }
}

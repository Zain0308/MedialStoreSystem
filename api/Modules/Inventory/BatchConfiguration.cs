using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MedicalStore.Api.Modules.Inventory;

public sealed class BatchConfiguration : IEntityTypeConfiguration<Batch>
{
    public void Configure(EntityTypeBuilder<Batch> builder)
    {
        builder.Property(x => x.Number).HasMaxLength(100);
        builder.Property(x => x.CostPrice).HasPrecision(18, 4);
        builder.Property(x => x.SalePrice).HasPrecision(18, 4);
        builder.Property(x => x.RowVersion).IsRowVersion();
        builder.HasIndex(x => new { x.MedicineId, x.ExpiryDate });
    }
}

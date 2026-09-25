using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MedicalStore.Api.Modules.Sales;

public sealed class SaleReturnConfiguration : IEntityTypeConfiguration<SaleReturn>
{
    public void Configure(EntityTypeBuilder<SaleReturn> builder)
    {
        builder.Property(x => x.Reason).HasMaxLength(300);
        builder.Property(x => x.RefundMethod).HasMaxLength(30);
        builder.Property(x => x.TotalRefund).HasPrecision(18, 2);
        builder.HasOne(x => x.Sale).WithMany(x => x.Returns).HasForeignKey(x => x.SaleId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(x => x.Lines).WithOne(x => x.SaleReturn).HasForeignKey(x => x.SaleReturnId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class SaleReturnLineConfiguration : IEntityTypeConfiguration<SaleReturnLine>
{
    public void Configure(EntityTypeBuilder<SaleReturnLine> builder)
    {
        builder.Property(x => x.UnitRefund).HasPrecision(18, 4);
        builder.HasOne(x => x.SaleLine).WithMany().HasForeignKey(x => x.SaleLineId).OnDelete(DeleteBehavior.Restrict);
    }
}

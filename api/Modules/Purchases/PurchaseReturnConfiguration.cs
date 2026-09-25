using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MedicalStore.Api.Modules.Purchases;

public sealed class PurchaseReturnConfiguration : IEntityTypeConfiguration<PurchaseReturn>
{
    public void Configure(EntityTypeBuilder<PurchaseReturn> builder)
    {
        builder.Property(x => x.SupplierReference).HasMaxLength(100);
        builder.Property(x => x.Reason).HasMaxLength(300);
        builder.Property(x => x.Total).HasPrecision(18, 2);
        builder.HasOne(x => x.Purchase).WithMany(x => x.Returns).HasForeignKey(x => x.PurchaseId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(x => x.Lines).WithOne(x => x.PurchaseReturn).HasForeignKey(x => x.PurchaseReturnId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PurchaseReturnLineConfiguration : IEntityTypeConfiguration<PurchaseReturnLine>
{
    public void Configure(EntityTypeBuilder<PurchaseReturnLine> builder)
    {
        builder.Property(x => x.UnitCost).HasPrecision(18, 4);
        builder.HasOne(x => x.PurchaseLine).WithMany().HasForeignKey(x => x.PurchaseLineId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class SupplierPaymentConfiguration : IEntityTypeConfiguration<SupplierPayment>
{
    public void Configure(EntityTypeBuilder<SupplierPayment> builder)
    {
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.Method).HasMaxLength(30);
        builder.Property(x => x.Reference).HasMaxLength(120);
        builder.HasOne(x => x.Purchase).WithMany(x => x.Payments).HasForeignKey(x => x.PurchaseId).OnDelete(DeleteBehavior.Restrict);
    }
}

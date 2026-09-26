using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MedicalStore.Api.Modules.Purchases;

public sealed class PurchaseCorrectionConfiguration : IEntityTypeConfiguration<PurchaseCorrection>
{
    public void Configure(EntityTypeBuilder<PurchaseCorrection> builder)
    {
        builder.Property(x => x.Reason).HasMaxLength(300);
        builder.Property(x => x.ActorId).HasMaxLength(450);
        builder.Property(x => x.PreviousTotal).HasPrecision(18, 2);
        builder.Property(x => x.CorrectedTotal).HasPrecision(18, 2);
        builder.HasOne(x => x.Purchase).WithMany(x => x.Corrections).HasForeignKey(x => x.PurchaseId).OnDelete(DeleteBehavior.Restrict);
        builder.HasMany(x => x.Lines).WithOne(x => x.PurchaseCorrection).HasForeignKey(x => x.PurchaseCorrectionId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class PurchaseCorrectionLineConfiguration : IEntityTypeConfiguration<PurchaseCorrectionLine>
{
    public void Configure(EntityTypeBuilder<PurchaseCorrectionLine> builder)
    {
        builder.HasOne(x => x.PurchaseLine).WithMany().HasForeignKey(x => x.PurchaseLineId).OnDelete(DeleteBehavior.Restrict);
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MedicalStore.Api.Modules.Medicines;

public sealed class MedicineConfiguration : IEntityTypeConfiguration<Medicine>
{
    public void Configure(EntityTypeBuilder<Medicine> builder)
    {
        builder.HasIndex(x => x.Barcode).IsUnique().HasFilter("[Barcode] IS NOT NULL");
        builder.Property(x => x.Name).HasMaxLength(200);
        builder.Property(x => x.Barcode).HasMaxLength(100);
        builder.Property(x => x.Strength).HasMaxLength(80);
        builder.Property(x => x.DosageForm).HasMaxLength(80);
        builder.Property(x => x.Manufacturer).HasMaxLength(160);
        builder.Property(x => x.Description).HasMaxLength(1000);
    }
}

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MedicalStore.Api.Modules.Inventory;

public sealed class StockMovementConfiguration : IEntityTypeConfiguration<StockMovement>
{
    public void Configure(EntityTypeBuilder<StockMovement> builder)
    {
        builder.Property(x => x.Type).HasMaxLength(30);
        builder.Property(x => x.Reason).HasMaxLength(300);
        builder.Property(x => x.ActorId).HasMaxLength(450);
        builder.HasIndex(x => new { x.BatchId, x.CreatedAt });
        builder.HasOne<Batch>().WithMany().HasForeignKey(x => x.BatchId).OnDelete(DeleteBehavior.Restrict);
    }
}

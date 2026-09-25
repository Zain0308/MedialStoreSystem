using MedicalStore.Api.Modules.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MedicalStore.Api.Modules.Stores;

public sealed class StoreConfiguration : IEntityTypeConfiguration<Store>
{
    public void Configure(EntityTypeBuilder<Store> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(160).IsRequired();
        builder.Property(x => x.Code).HasMaxLength(40).IsRequired();
        builder.Property(x => x.SubscriptionPlan).HasMaxLength(80).IsRequired();
        builder.Property(x => x.SubscriptionStatus).HasMaxLength(20).IsRequired();
        builder.HasIndex(x => x.Code).IsUnique();
    }
}

public sealed class StoreMembershipConfiguration : IEntityTypeConfiguration<StoreMembership>
{
    public void Configure(EntityTypeBuilder<StoreMembership> builder)
    {
        builder.HasKey(x => new { x.UserId, x.StoreId });
        builder.Property(x => x.UserId).HasMaxLength(450);
        builder.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(x => x.Store).WithMany().HasForeignKey(x => x.StoreId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(x => new { x.UserId, x.IsDefault }).IsUnique().HasFilter("[IsDefault] = 1");
        builder.HasIndex(x => x.StoreId);
    }
}

public sealed class StorePermissionGrantConfiguration : IEntityTypeConfiguration<StorePermissionGrant>
{
    public void Configure(EntityTypeBuilder<StorePermissionGrant> builder)
    {
        builder.HasKey(x => new { x.StoreId, x.PermissionKey });
        builder.Property(x => x.PermissionKey).HasMaxLength(80).IsRequired();
        builder.HasOne<Store>().WithMany().HasForeignKey(x => x.StoreId).OnDelete(DeleteBehavior.Cascade);
    }
}


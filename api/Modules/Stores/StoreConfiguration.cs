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
        builder.HasIndex(x => x.Code).IsUnique();
    }
}

public sealed class UserStoreConfiguration : IEntityTypeConfiguration<UserStore>
{
    public void Configure(EntityTypeBuilder<UserStore> builder)
    {
        builder.HasKey(x => new { x.UserId, x.StoreId });
        builder.Property(x => x.UserId).HasMaxLength(450);
        builder.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(x => x.Store).WithMany().HasForeignKey(x => x.StoreId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(x => new { x.UserId, x.IsDefault }).IsUnique().HasFilter("[IsDefault] = 1");
        builder.HasIndex(x => x.StoreId);
    }
}

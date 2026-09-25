using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using MedicalStore.Api.Modules.Authentication;
using MedicalStore.Api.Modules.Inventory;
using MedicalStore.Api.Modules.Medicines;
using MedicalStore.Api.Modules.Purchases;
using MedicalStore.Api.Modules.Sales;
using MedicalStore.Api.Modules.Stores;
using MedicalStore.Api.Modules.Suppliers;
using System.Reflection;
using System.Security;

namespace MedicalStore.Api.Infrastructure.Persistence;

public sealed class StoreDb(DbContextOptions<StoreDb> options, CurrentStoreContext currentStore) : IdentityDbContext<AppUser>(options)
{
    private readonly CurrentStoreContext _currentStore = currentStore;

    public DbSet<Medicine> Medicines => Set<Medicine>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<Batch> Batches => Set<Batch>();
    public DbSet<Purchase> Purchases => Set<Purchase>();
    public DbSet<PurchaseLine> PurchaseLines => Set<PurchaseLine>();
    public DbSet<PurchaseReturn> PurchaseReturns => Set<PurchaseReturn>();
    public DbSet<PurchaseReturnLine> PurchaseReturnLines => Set<PurchaseReturnLine>();
    public DbSet<SupplierPayment> SupplierPayments => Set<SupplierPayment>();
    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleLine> SaleLines => Set<SaleLine>();
    public DbSet<SaleReturn> SaleReturns => Set<SaleReturn>();
    public DbSet<SaleReturnLine> SaleReturnLines => Set<SaleReturnLine>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<Store> Stores => Set<Store>();
    public DbSet<StoreMembership> UserStores => Set<StoreMembership>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(StoreDb).Assembly);
        var filter = typeof(StoreDb).GetMethod(nameof(ConfigureStoreFilter), BindingFlags.NonPublic | BindingFlags.Static)!;
        foreach (var entityType in builder.Model.GetEntityTypes()
                     .Where(type => typeof(IStoreScoped).IsAssignableFrom(type.ClrType)).ToArray())
        {
            filter.MakeGenericMethod(entityType.ClrType).Invoke(null, [builder, this]);
            builder.Entity(entityType.ClrType).HasIndex(nameof(IStoreScoped.StoreId));
        }
    }

    private static void ConfigureStoreFilter<TEntity>(ModelBuilder builder, StoreDb context)
        where TEntity : class, IStoreScoped =>
        builder.Entity<TEntity>().HasQueryFilter(entity =>
            context._currentStore.StoreId.HasValue && entity.StoreId == context._currentStore.StoreId.Value);

    public override int SaveChanges() => SaveChanges(true);

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        ApplyStoreBoundary();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        SaveChangesAsync(true, cancellationToken);

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        ApplyStoreBoundary();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void ApplyStoreBoundary()
    {
        foreach (var entry in ChangeTracker.Entries<IStoreScoped>())
        {
            if (entry.State is EntityState.Detached or EntityState.Unchanged or EntityState.Deleted) continue;
            var activeStoreId = _currentStore.StoreId
                ?? throw new SecurityException("Business data cannot be changed without an active store.");
            if (entry.State == EntityState.Added)
            {
                entry.Entity.StoreId = activeStoreId;
                continue;
            }
            if (entry.Entity.StoreId != activeStoreId)
                throw new SecurityException("A record cannot be moved between stores.");
        }
    }
}

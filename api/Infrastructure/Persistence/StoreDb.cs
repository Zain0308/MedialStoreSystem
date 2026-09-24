using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using MedicalStore.Api.Modules.Authentication;
using MedicalStore.Api.Modules.Inventory;
using MedicalStore.Api.Modules.Medicines;
using MedicalStore.Api.Modules.Purchases;
using MedicalStore.Api.Modules.Sales;
using MedicalStore.Api.Modules.Suppliers;

namespace MedicalStore.Api.Infrastructure.Persistence;

public sealed class StoreDb(DbContextOptions<StoreDb> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<Medicine> Medicines => Set<Medicine>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<Batch> Batches => Set<Batch>();
    public DbSet<Purchase> Purchases => Set<Purchase>();
    public DbSet<PurchaseLine> PurchaseLines => Set<PurchaseLine>();
    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleLine> SaleLines => Set<SaleLine>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(StoreDb).Assembly);
    }
}

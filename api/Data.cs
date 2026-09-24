using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace MedicalStore.Api;

public sealed class AppUser : IdentityUser { }

public sealed class Medicine
{
    public long Id { get; set; }
    public required string Name { get; set; }
    public string? GenericName { get; set; }
    public string? Barcode { get; set; }
    public bool RequiresPrescription { get; set; }
    public int MinimumStock { get; set; }
    public bool IsActive { get; set; } = true;
    public List<Batch> Batches { get; set; } = [];
}

public sealed class Supplier
{
    public long Id { get; set; }
    public required string Name { get; set; }
    public string? Phone { get; set; }
}

public sealed class Batch
{
    public long Id { get; set; }
    public long MedicineId { get; set; }
    public Medicine Medicine { get; set; } = null!;
    public required string Number { get; set; }
    public DateOnly ExpiryDate { get; set; }
    public decimal CostPrice { get; set; }
    public decimal SalePrice { get; set; }
    public int Quantity { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

public sealed class Purchase
{
    public long Id { get; set; }
    public long SupplierId { get; set; }
    public Supplier Supplier { get; set; } = null!;
    public required string SupplierInvoice { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public decimal Total { get; set; }
    public List<PurchaseLine> Lines { get; set; } = [];
}

public sealed class PurchaseLine
{
    public long Id { get; set; }
    public long PurchaseId { get; set; }
    public long BatchId { get; set; }
    public Batch Batch { get; set; } = null!;
    public int Quantity { get; set; }
    public decimal UnitCost { get; set; }
}

public sealed class Sale
{
    public long Id { get; set; }
    public string InvoiceNumber { get; set; } = "PENDING";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public decimal Total { get; set; }
    public decimal CashReceived { get; set; }
    public string CashierId { get; set; } = "";
    public List<SaleLine> Lines { get; set; } = [];
}

public sealed class SaleLine
{
    public long Id { get; set; }
    public long SaleId { get; set; }
    public long BatchId { get; set; }
    public Batch Batch { get; set; } = null!;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal UnitCost { get; set; }
}

public sealed class StockMovement
{
    public long Id { get; set; }
    public long BatchId { get; set; }
    public string Type { get; set; } = "";
    public long ReferenceId { get; set; }
    public int QuantityChange { get; set; }
    public int BalanceAfter { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

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

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        b.Entity<Medicine>().HasIndex(x => x.Barcode).IsUnique().HasFilter("[Barcode] IS NOT NULL");
        b.Entity<Medicine>().Property(x => x.Name).HasMaxLength(200);
        b.Entity<Medicine>().Property(x => x.Barcode).HasMaxLength(100);
        b.Entity<Supplier>().Property(x => x.Name).HasMaxLength(200);
        b.Entity<Batch>().Property(x => x.Number).HasMaxLength(100);
        b.Entity<Batch>().Property(x => x.CostPrice).HasPrecision(18, 4);
        b.Entity<Batch>().Property(x => x.SalePrice).HasPrecision(18, 4);
        b.Entity<Batch>().Property(x => x.RowVersion).IsRowVersion();
        b.Entity<Batch>().HasIndex(x => new { x.MedicineId, x.ExpiryDate });
        b.Entity<Purchase>().Property(x => x.SupplierInvoice).HasMaxLength(100);
        b.Entity<Purchase>().Property(x => x.Total).HasPrecision(18, 2);
        b.Entity<Purchase>().HasIndex(x => new { x.SupplierId, x.SupplierInvoice }).IsUnique();
        b.Entity<PurchaseLine>().Property(x => x.UnitCost).HasPrecision(18, 4);
        b.Entity<Sale>().Property(x => x.Total).HasPrecision(18, 2);
        b.Entity<Sale>().Property(x => x.CashReceived).HasPrecision(18, 2);
        b.Entity<Sale>().HasIndex(x => x.InvoiceNumber).IsUnique();
        b.Entity<SaleLine>().Property(x => x.UnitPrice).HasPrecision(18, 4);
        b.Entity<SaleLine>().Property(x => x.UnitCost).HasPrecision(18, 4);
        b.Entity<StockMovement>().Property(x => x.Type).HasMaxLength(30);
        b.Entity<StockMovement>().HasIndex(x => new { x.BatchId, x.CreatedAt });
        b.Entity<StockMovement>().HasOne<Batch>().WithMany().HasForeignKey(x => x.BatchId).OnDelete(DeleteBehavior.Restrict);
    }
}

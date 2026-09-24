using Microsoft.EntityFrameworkCore;

namespace MedicalStore.Api;

public static class CatalogEndpoints
{
    public static void MapCatalogEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/medicines", async (StoreDb db) =>
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            return Results.Ok(await db.Medicines.OrderBy(x => x.Name).Select(x => new
            {
                x.Id, x.Name, x.GenericName, x.Barcode, x.RequiresPrescription, x.MinimumStock, x.IsActive,
                stock = x.Batches.Where(b => b.ExpiryDate >= today).Sum(b => b.Quantity)
            }).ToListAsync());
        });

        api.MapPost("/medicines", async (MedicineRequest input, StoreDb db) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name) || input.MinimumStock < 0) return Results.BadRequest("Name and nonnegative minimum stock are required.");
            var barcode = string.IsNullOrWhiteSpace(input.Barcode) ? null : input.Barcode.Trim();
            if (barcode is not null && await db.Medicines.AnyAsync(x => x.Barcode == barcode)) return Results.Conflict("Barcode already exists.");
            var medicine = new Medicine { Name = input.Name.Trim(), GenericName = input.GenericName?.Trim(), Barcode = barcode,
                MinimumStock = input.MinimumStock, RequiresPrescription = input.RequiresPrescription };
            db.Medicines.Add(medicine);
            await db.SaveChangesAsync();
            return Results.Created($"/api/medicines/{medicine.Id}", new { medicine.Id });
        });

        api.MapGet("/suppliers", async (StoreDb db) => Results.Ok(await db.Suppliers.OrderBy(x => x.Name).ToListAsync()));
        api.MapPost("/suppliers", async (SupplierRequest input, StoreDb db) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest("Supplier name is required.");
            var supplier = new Supplier { Name = input.Name.Trim(), Phone = input.Phone?.Trim() };
            db.Suppliers.Add(supplier);
            await db.SaveChangesAsync();
            return Results.Created($"/api/suppliers/{supplier.Id}", new { supplier.Id });
        });
    }
}

using Microsoft.EntityFrameworkCore;
using MedicalStore.Api.Infrastructure.Persistence;

namespace MedicalStore.Api.Modules.Suppliers;

public static class SupplierEndpoints
{
    public static void MapSupplierEndpoints(this RouteGroupBuilder api)
    {
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

using Microsoft.EntityFrameworkCore;
using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Authentication;

namespace MedicalStore.Api.Modules.Suppliers;

public static class SupplierEndpoints
{
    public static void MapSupplierEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/suppliers", async (StoreDb db) => Results.Ok(await db.Suppliers.OrderBy(x => x.Name).ToListAsync()))
            .RequireAuthorization(StorePermissions.SuppliersRead);
        api.MapPost("/suppliers", async (SupplierRequest input, StoreDb db) =>
        {
            if (!IsValid(input)) return Results.BadRequest("Enter a supplier name and keep the optional details within their length limits.");
            var supplier = new Supplier
            {
                Name = input.Name.Trim(), Phone = Normalize(input.Phone), ContactPerson = Normalize(input.ContactPerson),
                Email = Normalize(input.Email), Address = Normalize(input.Address)
            };
            db.Suppliers.Add(supplier);
            await db.SaveChangesAsync();
            return Results.Created($"/api/suppliers/{supplier.Id}", new { supplier.Id });
        }).RequireAuthorization(StorePermissions.SuppliersManage);

        api.MapPut("/suppliers/{id:long}", async (long id, SupplierRequest input, StoreDb db) =>
        {
            if (!IsValid(input)) return Results.BadRequest("Enter a supplier name and keep the optional details within their length limits.");
            var supplier = await db.Suppliers.SingleOrDefaultAsync(x => x.Id == id);
            if (supplier is null) return Results.NotFound();
            supplier.Name = input.Name.Trim();
            supplier.Phone = Normalize(input.Phone);
            supplier.ContactPerson = Normalize(input.ContactPerson);
            supplier.Email = Normalize(input.Email);
            supplier.Address = Normalize(input.Address);
            await db.SaveChangesAsync();
            return Results.Ok(supplier);
        }).RequireAuthorization(StorePermissions.SuppliersManage);
    }

    private static bool IsValid(SupplierRequest input) =>
        !string.IsNullOrWhiteSpace(input.Name) && input.Name.Trim().Length <= 200 &&
        (input.Phone?.Length ?? 0) <= 40 && (input.ContactPerson?.Length ?? 0) <= 120 &&
        (input.Email?.Length ?? 0) <= 254 && (input.Address?.Length ?? 0) <= 300;

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

using System.Security.Claims;
using System.Text.RegularExpressions;
using MedicalStore.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace MedicalStore.Api.Modules.Stores;

public static class StoreEndpoints
{
    public static void MapStoreEndpoints(this RouteGroupBuilder api)
    {
        var stores = api.MapGroup("/stores");
        stores.MapGet("", ListMyStoresAsync);
        stores.MapGet("/all", ListAllStoresAsync).RequireAuthorization(policy => policy.RequireRole("Administrator"));
        stores.MapPost("", CreateStoreAsync).RequireAuthorization(policy => policy.RequireRole("Administrator"));
    }

    private static async Task<IResult> ListMyStoresAsync(ClaimsPrincipal principal, StoreDb db)
    {
        var userId = principal.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Results.Unauthorized();
        var result = await db.UserStores.AsNoTracking().Include(x => x.Store)
            .Where(x => x.UserId == userId && x.Store.IsActive)
            .OrderByDescending(x => x.IsDefault).ThenBy(x => x.Store.Name)
            .Select(x => new StoreSummary(x.StoreId, x.Store.Name, x.Store.Code, x.IsDefault))
            .ToArrayAsync();
        return Results.Ok(result);
    }

    private static async Task<IResult> ListAllStoresAsync(StoreDb db) =>
        Results.Ok(await db.Stores.AsNoTracking().OrderBy(x => x.Name)
            .Select(x => new { x.Id, x.Name, x.Code, x.IsActive }).ToArrayAsync());

    private static async Task<IResult> CreateStoreAsync(CreateStoreRequest request, ClaimsPrincipal principal, StoreDb db)
    {
        var name = request.Name?.Trim() ?? "";
        var code = request.Code?.Trim().ToUpperInvariant() ?? "";
        if (name.Length is < 2 or > 160) return Results.BadRequest("Store name must be 2–160 characters.");
        if (!Regex.IsMatch(code, @"^[A-Z0-9][A-Z0-9_-]{1,39}$"))
            return Results.BadRequest("Store code must be 2–40 characters using letters, numbers, _ or -.");
        if (await db.Stores.AnyAsync(x => x.Code == code)) return Results.Conflict("Store code already exists.");

        var userId = principal.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Results.Unauthorized();
        var store = new Store { Name = name, Code = code };
        db.Stores.Add(store);
        await db.SaveChangesAsync();
        db.UserStores.Add(new StoreMembership { UserId = userId, StoreId = store.Id, IsDefault = false });
        await db.SaveChangesAsync();
        return Results.Created($"/api/stores/{store.Id}", new StoreSummary(store.Id, store.Name, store.Code, false));
    }
}

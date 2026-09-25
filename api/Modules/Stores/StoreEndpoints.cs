using System.Security.Claims;
using System.Text.RegularExpressions;
using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Authentication;
using Microsoft.EntityFrameworkCore;

namespace MedicalStore.Api.Modules.Stores;

public static class StoreEndpoints
{
    public static void MapStoreEndpoints(this RouteGroupBuilder api)
    {
        var stores = api.MapGroup("/stores");
        stores.MapGet("", ListMyStoresAsync);
        stores.MapGet("/all", ListAllStoresAsync).RequireAuthorization(StorePermissions.ApplicationOwnerPolicy);
        stores.MapPost("", CreateStoreAsync).RequireAuthorization(StorePermissions.ApplicationOwnerPolicy);
        stores.MapPut("/{id:long}/status", SetStoreStatusAsync).RequireAuthorization(StorePermissions.ApplicationOwnerPolicy);
        stores.MapPut("/{id:long}/subscription", SetStoreSubscriptionAsync).RequireAuthorization(StorePermissions.ApplicationOwnerPolicy);
        stores.MapPut("/{id:long}/permissions", SetStorePermissionsAsync).RequireAuthorization(StorePermissions.ApplicationOwnerPolicy);
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

    private static async Task<IResult> ListAllStoresAsync(StoreDb db)
    {
        var stores = await db.Stores.AsNoTracking().OrderBy(x => x.Name).ToListAsync();
        var grants = await db.StorePermissionGrants.AsNoTracking().ToListAsync();
        return Results.Ok(stores.Select(store => new
        {
            store.Id, store.Name, store.Code, store.IsActive, store.SubscriptionPlan, store.SubscriptionStatus,
            store.TrialEndsAt, store.SubscriptionExpiresAt,
            Permissions = grants.Where(x => x.StoreId == store.Id).Select(x => x.PermissionKey).ToArray()
        }));
    }

    private static async Task<IResult> SetStoreStatusAsync(long id, UpdateStoreStatusRequest request, StoreDb db)
    {
        var store = await db.Stores.SingleOrDefaultAsync(x => x.Id == id);
        if (store is null) return Results.NotFound();
        if (!request.IsActive && store.IsActive && await db.Stores.CountAsync(x => x.IsActive) <= 1)
            return Results.Conflict("At least one active store must remain.");
        store.IsActive = request.IsActive;
        await db.SaveChangesAsync();
        return Results.Ok(new { store.Id, store.Name, store.Code, store.IsActive });
    }

    private static async Task<IResult> SetStoreSubscriptionAsync(long id, UpdateStoreSubscriptionRequest request, StoreDb db)
    {
        var store = await db.Stores.SingleOrDefaultAsync(x => x.Id == id);
        if (store is null) return Results.NotFound();
        var plan = request.PlanName?.Trim() ?? "";
        var status = request.Status?.Trim() ?? "";
        if (plan.Length is < 2 or > 80) return Results.BadRequest("Plan name must be 2–80 characters.");
        if (status is not ("Trial" or "Active" or "Suspended"))
            return Results.BadRequest("Status must be Trial, Active or Suspended.");
        if (status == "Trial" && request.TrialEndsAt is null)
            return Results.BadRequest("Set an end date for the free trial.");
        if (status == "Active" && request.SubscriptionExpiresAt is { } end && end <= DateTimeOffset.UtcNow)
            return Results.BadRequest("Subscription expiry must be in the future.");
        if (status == "Trial" && request.TrialEndsAt is { } trialEnd && trialEnd <= DateTimeOffset.UtcNow)
            return Results.BadRequest("Trial expiry must be in the future.");
        store.SubscriptionPlan = plan;
        store.SubscriptionStatus = status;
        store.TrialEndsAt = status == "Trial" ? request.TrialEndsAt : null;
        store.SubscriptionExpiresAt = status == "Active" ? request.SubscriptionExpiresAt : null;
        await db.SaveChangesAsync();
        return Results.Ok(new { store.Id, store.SubscriptionPlan, store.SubscriptionStatus, store.TrialEndsAt, store.SubscriptionExpiresAt });
    }

    private static async Task<IResult> SetStorePermissionsAsync(long id, UpdateStorePermissionsRequest request, StoreDb db)
    {
        if (!await db.Stores.AnyAsync(x => x.Id == id)) return Results.NotFound();
        var permissions = (request.Permissions ?? []).Distinct(StringComparer.Ordinal).ToArray();
        var unknown = permissions.Where(key => !StorePermissions.All.ContainsKey(key)).ToArray();
        if (unknown.Length > 0) return Results.BadRequest(new { message = "Unknown permission key.", permissions = unknown });
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        var existing = await db.StorePermissionGrants.Where(x => x.StoreId == id).ToListAsync();
        var desired = permissions.ToHashSet(StringComparer.Ordinal);
        db.StorePermissionGrants.RemoveRange(existing.Where(x => !desired.Contains(x.PermissionKey)));
        var current = existing.Select(x => x.PermissionKey).ToHashSet(StringComparer.Ordinal);
        db.StorePermissionGrants.AddRange(desired.Where(key => !current.Contains(key))
            .Select(key => new StorePermissionGrant { StoreId = id, PermissionKey = key }));
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(new { storeId = id, permissions });
    }

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
        db.StorePermissionGrants.AddRange(StorePermissions.All.Keys.Select(key =>
            new StorePermissionGrant { StoreId = store.Id, PermissionKey = key }));
        await db.SaveChangesAsync();
        return Results.Created($"/api/stores/{store.Id}", new StoreSummary(store.Id, store.Name, store.Code, false));
    }
}


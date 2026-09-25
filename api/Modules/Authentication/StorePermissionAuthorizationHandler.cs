using MedicalStore.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace MedicalStore.Api.Modules.Authentication;

public sealed record StorePermissionRequirement(string Permission) : IAuthorizationRequirement;

public sealed class StorePermissionAuthorizationHandler(
    StoreDb db,
    CurrentStoreContext currentStore) : AuthorizationHandler<StorePermissionRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        StorePermissionRequirement requirement)
    {
        if (context.User.HasClaim("app_owner", "true"))
        {
            context.Succeed(requirement);
            return;
        }

        if (currentStore.StoreId is not long storeId) return;
        if (!await db.StorePermissionGrants.AnyAsync(x =>
                x.StoreId == storeId && x.PermissionKey == requirement.Permission))
            return;

        if (context.User.IsInRole(StoreRoles.Administrator) ||
            context.User.HasClaim("permission", requirement.Permission))
            context.Succeed(requirement);
    }
}


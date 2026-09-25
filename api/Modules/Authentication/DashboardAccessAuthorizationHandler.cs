using MedicalStore.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace MedicalStore.Api.Modules.Authentication;

public sealed class DashboardAccessRequirement : IAuthorizationRequirement { }

public sealed class DashboardAccessAuthorizationHandler(
    StoreDb db,
    CurrentStoreContext currentStore) : AuthorizationHandler<DashboardAccessRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        DashboardAccessRequirement requirement)
    {
        if (context.User.HasClaim("app_owner", "true") || currentStore.SubscriptionExpired)
        {
            context.Succeed(requirement);
            return;
        }

        if (currentStore.StoreId is not long storeId ||
            !await db.StorePermissionGrants.AnyAsync(x => x.StoreId == storeId && x.PermissionKey == StorePermissions.ReportsRead))
            return;

        if (context.User.IsInRole(StoreRoles.Administrator) || context.User.HasClaim("permission", StorePermissions.ReportsRead))
            context.Succeed(requirement);
    }
}

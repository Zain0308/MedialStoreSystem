using System.Text;
using System.IdentityModel.Tokens.Jwt;
using MedicalStore.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using MedicalStore.Api.Modules.Stores;

namespace MedicalStore.Api.Modules.Authentication;

public static class AuthenticationModule
{
    public static IServiceCollection AddAuthenticationModule(this IServiceCollection services, string jwtKey, string ownerEmail)
    {
        services.AddIdentityCore<AppUser>(o =>
        {
            o.Password.RequiredLength = 12;
            o.Password.RequireNonAlphanumeric = true;
            o.Lockout.MaxFailedAccessAttempts = 5;
            o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        }).AddRoles<IdentityRole>().AddEntityFrameworkStores<StoreDb>();
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
        {
            o.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true, ValidIssuer = "MedicalStore",
                ValidateAudience = true, ValidAudience = "MedicalStore.Web",
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
                ValidateLifetime = true,
                RoleClaimType = ClaimTypes.Role,
                ClockSkew = TimeSpan.FromSeconds(30)
            };
            o.Events = new JwtBearerEvents
            {
                OnTokenValidated = async context =>
                {
                    var userId = context.Principal?.FindFirstValue(JwtRegisteredClaimNames.Sub)
                        ?? context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
                    var stamp = context.Principal?.FindFirstValue("security_stamp");
                    if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(stamp))
                    {
                        context.Fail("The access token is incomplete.");
                        return;
                    }

                    var storeIdText = context.Principal?.FindFirstValue("store_id");
                    if (!long.TryParse(storeIdText, out var storeId) || storeId <= 0)
                    {
                        context.Fail("The access token has no active store. Sign in again.");
                        return;
                    }

                    var users = context.HttpContext.RequestServices.GetRequiredService<UserManager<AppUser>>();
                    var user = await users.FindByIdAsync(userId);
                    var isApplicationOwner = context.Principal?.HasClaim("app_owner", "true") == true;
                    if (isApplicationOwner && !string.Equals(user?.Email, ownerEmail, StringComparison.OrdinalIgnoreCase))
                        context.Fail("The Application Owner account has changed. Sign in again.");
                    else if (user is null || await users.IsLockedOutAsync(user) || user.SecurityStamp != stamp)
                        context.Fail("The account is inactive or its access has changed. Sign in again.");
                    else
                    {
                        var db = context.HttpContext.RequestServices.GetRequiredService<StoreDb>();
                        var membershipExists = await db.UserStores.AnyAsync(x =>
                            x.UserId == userId && x.StoreId == storeId && (isApplicationOwner || x.Store.IsActive));
                        if (!membershipExists) context.Fail("The selected store is no longer assigned to this account.");
                        else
                        {
                            var store = await db.Stores.SingleAsync(x => x.Id == storeId);
                            if (!isApplicationOwner && !IsSubscriptionAvailable(store, DateTimeOffset.UtcNow))
                                context.Fail("This store's subscription is inactive or expired.");
                            else context.HttpContext.RequestServices.GetRequiredService<CurrentStoreContext>().Select(storeId);
                        }
                    }
                }
            };
        });
        services.AddAuthorization(options =>
        {
            options.AddPolicy(StorePermissions.ApplicationOwnerPolicy,
                policy => policy.RequireClaim("app_owner", "true"));
            foreach (var permission in StorePermissions.All.Keys)
                options.AddPolicy(permission, policy => policy.AddRequirements(new StorePermissionRequirement(permission)));
        });
        services.AddScoped<IAuthorizationHandler, StorePermissionAuthorizationHandler>();
        return services;
    }

    private static bool IsSubscriptionAvailable(Store store, DateTimeOffset now) =>
        store.IsActive &&
        ((string.Equals(store.SubscriptionStatus, "Active", StringComparison.OrdinalIgnoreCase) &&
          (!store.SubscriptionExpiresAt.HasValue || store.SubscriptionExpiresAt.Value > now)) ||
         (string.Equals(store.SubscriptionStatus, "Trial", StringComparison.OrdinalIgnoreCase) &&
          store.TrialEndsAt.HasValue && store.TrialEndsAt.Value > now));
}

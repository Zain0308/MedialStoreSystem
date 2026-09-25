using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Stores;

namespace MedicalStore.Api.Modules.Authentication;

public static class AuthenticationEndpoints
{
    private const string PermissionClaim = "permission";

    public static void MapAuthenticationEndpoints(this IEndpointRouteBuilder app, string jwtKey, string ownerEmail)
    {
        app.MapPost("/api/auth/login", LoginAsync).AllowAnonymous();
        app.MapPost("/api/auth/switch-store", SwitchStoreAsync).RequireAuthorization();

        var management = app.MapGroup("/api/auth").RequireAuthorization(StorePermissions.ApplicationOwnerPolicy);
        management.MapGet("/users", ListUsersAsync);
        management.MapPost("/users", CreateUserAsync);
        management.MapPut("/users/{id}/roles", UpdateUserRolesAsync);
        management.MapPut("/users/{id}/status", UpdateUserStatusAsync);
        management.MapPut("/users/{id}/stores", UpdateUserStoresAsync);
        management.MapPut("/users/{id}/password", ResetUserPasswordAsync);
        management.MapGet("/roles", ListRolesAsync);
        management.MapPost("/roles", CreateRoleAsync).RequireAuthorization(StorePermissions.RolesManage);
        management.MapPut("/roles/{id}/permissions", UpdateRolePermissionsAsync).RequireAuthorization(StorePermissions.RolesManage);

        async Task<IResult> LoginAsync(LoginRequest request, UserManager<AppUser> users, RoleManager<IdentityRole> roles, StoreDb db)
        {
            var email = request.Email?.Trim();
            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(request.Password)) return Results.Unauthorized();
            var user = await users.FindByEmailAsync(email);
            if (user is null || await users.IsLockedOutAsync(user)) return Results.Unauthorized();
            if (!await users.CheckPasswordAsync(user, request.Password))
            {
                await users.AccessFailedAsync(user);
                return Results.Unauthorized();
            }

            await users.ResetAccessFailedCountAsync(user);
            var isApplicationOwner = string.Equals(user.Email, ownerEmail, StringComparison.OrdinalIgnoreCase);
            var assignedStores = await db.UserStores.Include(x => x.Store)
                .Where(x => x.UserId == user.Id).OrderByDescending(x => x.IsDefault).ThenBy(x => x.Store.Name).ToListAsync();
            var activeStores = assignedStores.Where(x => IsSubscriptionAvailable(x.Store, DateTimeOffset.UtcNow)).ToList();
            var memberships = isApplicationOwner && activeStores.Count == 0 ? assignedStores : activeStores;
            if (memberships.Count == 0) return Results.Problem("This user has no active store subscription.", statusCode: 403);
            return await CreateSessionAsync(user, memberships.First().StoreId, memberships, users, roles, jwtKey, ownerEmail);
        }

        async Task<IResult> SwitchStoreAsync(SwitchStoreRequest request, ClaimsPrincipal principal,
            UserManager<AppUser> users, RoleManager<IdentityRole> roles, StoreDb db)
        {
            var userId = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrWhiteSpace(userId)) return Results.Unauthorized();
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var memberships = await db.UserStores.Include(x => x.Store)
                .Where(x => x.UserId == userId && x.Store.IsActive).ToListAsync();
            var selectedMembership = memberships.SingleOrDefault(x => x.StoreId == request.StoreId);
            if (selectedMembership is null) return Results.Forbid();

            // The filtered unique index allows one default store per user. Clear the current
            // default first so SQL Server never observes two defaults during the update batch.
            foreach (var item in memberships) item.IsDefault = false;
            await db.SaveChangesAsync();
            selectedMembership.IsDefault = true;
            await db.SaveChangesAsync();
            await transaction.CommitAsync();

            var user = await users.FindByIdAsync(userId);
            if (user is null) return Results.Unauthorized();
            return await CreateSessionAsync(user, request.StoreId, memberships, users, roles, jwtKey, ownerEmail);
        }

        static async Task<IResult> ListUsersAsync(UserManager<AppUser> users, StoreDb db)
        {
            var result = new List<UserSummary>();
            foreach (var user in await users.Users.OrderBy(x => x.Email).ToListAsync())
            {
                var stores = await db.UserStores.Where(x => x.UserId == user.Id).Select(x => x.StoreId).ToArrayAsync();
                result.Add(new UserSummary(user.Id, user.Email ?? user.UserName ?? "", await users.GetRolesAsync(user), !await users.IsLockedOutAsync(user), stores));
            }
            return Results.Ok(result);
        }

        static async Task<IResult> CreateUserAsync(CreateStoreUserRequest request, UserManager<AppUser> users,
            RoleManager<IdentityRole> roles, StoreDb db, HttpContext http)
        {
            var email = request.Email?.Trim() ?? "";
            var roleNames = NormalizeRoleNames(request.Roles);
            var storeIds = (request.StoreIds ?? []).Where(id => id > 0).Distinct().ToArray();
            if (string.IsNullOrWhiteSpace(email) || !email.Contains('@') || string.IsNullOrWhiteSpace(request.Password) || roleNames.Count == 0)
                return Results.BadRequest("A valid email, password, at least one role and one store are required.");
            if (storeIds.Length == 0) return Results.BadRequest("Assign the user to at least one store.");
            if (await db.Stores.CountAsync(store => storeIds.Contains(store.Id) && store.IsActive) != storeIds.Length)
                return Results.BadRequest("One or more selected stores are inactive or do not exist.");
            if (!await RolesExistAsync(roleNames, roles)) return Results.BadRequest("One or more selected roles do not exist.");
            if (!await CanAssignRolesAsync(http.User, roleNames, roles)) return Results.Forbid();

            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var user = new AppUser { UserName = email, Email = email, EmailConfirmed = true, LockoutEnabled = true };
            var created = await users.CreateAsync(user, request.Password);
            if (!created.Succeeded) return Results.BadRequest(string.Join("; ", IdentityErrors(created)));
            var assigned = await users.AddToRolesAsync(user, roleNames);
            if (!assigned.Succeeded)
            {
                await users.DeleteAsync(user);
                return Results.BadRequest(string.Join("; ", IdentityErrors(assigned)));
            }
            foreach (var (storeId, index) in storeIds.Select((id, index) => (id, index)))
                db.UserStores.Add(new StoreMembership { UserId = user.Id, StoreId = storeId, IsDefault = index == 0 });
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.Created($"/api/auth/users/{user.Id}", new UserSummary(user.Id, email, roleNames, true, storeIds));
        }

        static async Task<IResult> UpdateUserRolesAsync(string id, UpdateUserRolesRequest request,
            HttpContext http, UserManager<AppUser> users, RoleManager<IdentityRole> roles, StoreDb db)
        {
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var user = await users.FindByIdAsync(id);
            if (user is null) return Results.NotFound();
            var currentId = http.User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? http.User.FindFirstValue(ClaimTypes.NameIdentifier);
            var currentRoles = await users.GetRolesAsync(user);
            var nextRoles = NormalizeRoleNames(request.Roles);
            if (nextRoles.Count == 0) return Results.BadRequest("A user must keep at least one role.");
            if (!await RolesExistAsync(nextRoles, roles)) return Results.BadRequest("One or more selected roles do not exist.");
            if (!await CanAssignRolesAsync(http.User, nextRoles, roles)) return Results.Forbid();
            if (id == currentId && !nextRoles.Contains(StoreRoles.Administrator, StringComparer.OrdinalIgnoreCase))
                return Results.BadRequest("You cannot remove your own Administrator role.");

            if (currentRoles.Contains(StoreRoles.Administrator, StringComparer.Ordinal) &&
                !nextRoles.Contains(StoreRoles.Administrator, StringComparer.OrdinalIgnoreCase) &&
                await IsLastActiveAdministratorAsync(users, user))
                return Results.Conflict("The store must keep at least one active Administrator.");

            var removed = await users.RemoveFromRolesAsync(user, currentRoles);
            if (!removed.Succeeded) return Results.BadRequest(string.Join("; ", IdentityErrors(removed)));
            var added = await users.AddToRolesAsync(user, nextRoles);
            if (!added.Succeeded)
            {
                await users.AddToRolesAsync(user, currentRoles);
                return Results.BadRequest(string.Join("; ", IdentityErrors(added)));
            }
            await users.UpdateSecurityStampAsync(user);
            await transaction.CommitAsync();
            var storeIds = await db.UserStores.Where(x => x.UserId == user.Id).Select(x => x.StoreId).ToArrayAsync();
            return Results.Ok(new UserSummary(user.Id, user.Email ?? "", nextRoles, !await users.IsLockedOutAsync(user), storeIds));
        }

        static async Task<IResult> UpdateUserStatusAsync(string id, UpdateUserStatusRequest request,
            HttpContext http, UserManager<AppUser> users, StoreDb db)
        {
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var user = await users.FindByIdAsync(id);
            if (user is null) return Results.NotFound();
            var currentId = http.User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? http.User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userRoles = await users.GetRolesAsync(user);
            if (!request.IsActive && id == currentId) return Results.BadRequest("You cannot deactivate your own account.");
            if (!request.IsActive && userRoles.Contains(StoreRoles.Administrator, StringComparer.Ordinal) &&
                await IsLastActiveAdministratorAsync(users, user))
                return Results.Conflict("The store must keep at least one active Administrator.");

            var changed = await users.SetLockoutEnabledAsync(user, true);
            if (!changed.Succeeded) return Results.BadRequest(string.Join("; ", IdentityErrors(changed)));
            changed = await users.SetLockoutEndDateAsync(user, request.IsActive ? null : DateTimeOffset.MaxValue);
            if (!changed.Succeeded) return Results.BadRequest(string.Join("; ", IdentityErrors(changed)));
            await users.UpdateSecurityStampAsync(user);
            await transaction.CommitAsync();
            var storeIds = await db.UserStores.Where(x => x.UserId == user.Id).Select(x => x.StoreId).ToArrayAsync();
            return Results.Ok(new UserSummary(user.Id, user.Email ?? "", userRoles, request.IsActive, storeIds));
        }

        static async Task<IResult> ResetUserPasswordAsync(string id, ResetStoreUserPasswordRequest request,
            ClaimsPrincipal principal, UserManager<AppUser> users)
        {
            var actorId = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (id == actorId) return Results.BadRequest("Use the account password recovery process to change your own password.");
            var user = await users.FindByIdAsync(id);
            if (user is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(request.NewPassword))
                return Results.BadRequest("Enter a new password.");
            var token = await users.GeneratePasswordResetTokenAsync(user);
            var reset = await users.ResetPasswordAsync(user, token, request.NewPassword);
            if (!reset.Succeeded) return Results.BadRequest(IdentityErrors(reset));
            await users.UpdateSecurityStampAsync(user);
            return Results.Ok(new { userId = user.Id, message = "Password reset. Previous sessions have been revoked." });
        }

        static async Task<IResult> UpdateUserStoresAsync(string id, UpdateUserStoresRequest request,
            ClaimsPrincipal principal, UserManager<AppUser> users, StoreDb db)
        {
            var actorId = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (id == actorId) return Results.BadRequest("Use another Administrator to change your own store access.");
            var user = await users.FindByIdAsync(id);
            if (user is null) return Results.NotFound();

            var storeIds = (request.StoreIds ?? []).Where(x => x > 0).Distinct().ToArray();
            if (storeIds.Length == 0) return Results.BadRequest("Assign the user to at least one store.");
            var defaultStoreId = request.DefaultStoreId ?? storeIds[0];
            if (!storeIds.Contains(defaultStoreId)) return Results.BadRequest("The default store must be included in the assigned stores.");
            if (await db.Stores.CountAsync(x => storeIds.Contains(x.Id) && x.IsActive) != storeIds.Length)
                return Results.BadRequest("One or more selected stores are inactive or do not exist.");

            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var current = await db.UserStores.Where(x => x.UserId == id).ToListAsync();
            foreach (var membership in current) membership.IsDefault = false;
            await db.SaveChangesAsync();

            var keep = storeIds.ToHashSet();
            db.UserStores.RemoveRange(current.Where(x => !keep.Contains(x.StoreId)));
            var existing = current.Where(x => keep.Contains(x.StoreId)).ToDictionary(x => x.StoreId);
            foreach (var storeId in storeIds)
            {
                if (existing.TryGetValue(storeId, out var membership)) membership.IsDefault = storeId == defaultStoreId;
                else db.UserStores.Add(new StoreMembership { UserId = id, StoreId = storeId, IsDefault = storeId == defaultStoreId });
            }
            await db.SaveChangesAsync();
            await users.UpdateSecurityStampAsync(user);
            await transaction.CommitAsync();
            var assignedStoreIds = await db.UserStores.Where(x => x.UserId == id).Select(x => x.StoreId).ToArrayAsync();
            return Results.Ok(new { userId = id, storeIds = assignedStoreIds, defaultStoreId });
        }

        static async Task<IResult> ListRolesAsync(RoleManager<IdentityRole> roles, HttpContext http)
        {
            var result = new List<RoleSummary>();
            var actorPermissions = http.User.FindAll(PermissionClaim).Select(claim => claim.Value).ToHashSet(StringComparer.Ordinal);
            var isAdministrator = http.User.IsInRole(StoreRoles.Administrator);
            foreach (var role in await roles.Roles.OrderBy(x => x.Name).ToListAsync())
            {
                var permissions = (await roles.GetClaimsAsync(role))
                    .Where(claim => claim.Type == PermissionClaim && StorePermissions.All.ContainsKey(claim.Value))
                    .Select(claim => claim.Value).Distinct().Order().ToArray();
                result.Add(new RoleSummary(role.Id, role.Name ?? "", permissions,
                    StorePermissions.All.Select(item => new PermissionSummary(item.Key, item.Value)).ToArray(),
                    isAdministrator || permissions.All(actorPermissions.Contains)));
            }
            return Results.Ok(result);
        }

        static async Task<IResult> CreateRoleAsync(CreateStoreRoleRequest request, RoleManager<IdentityRole> roles)
        {
            var name = request.Name?.Trim() ?? "";
            if (!Regex.IsMatch(name, @"^[A-Za-z0-9][A-Za-z0-9 _-]{2,39}$"))
                return Results.BadRequest("Role name must be 3–40 characters and use letters, numbers, spaces, _ or -.");
            if (string.Equals(name, StoreRoles.Administrator, StringComparison.OrdinalIgnoreCase))
                return Results.Conflict("The Administrator role is reserved.");
            var role = new IdentityRole(name);
            var created = await roles.CreateAsync(role);
            return created.Succeeded ? Results.Created($"/api/auth/roles/{role.Id}", new { role.Id, role.Name }) : Results.BadRequest(string.Join("; ", IdentityErrors(created)));
        }

        static async Task<IResult> UpdateRolePermissionsAsync(string id, UpdateRolePermissionsRequest request,
            RoleManager<IdentityRole> roles, UserManager<AppUser> userManager, StoreDb db, HttpContext http)
        {
            await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var role = await roles.FindByIdAsync(id);
            if (role is null) return Results.NotFound();
            if (role.Name == StoreRoles.Administrator) return Results.BadRequest("Administrator permissions are fixed so the store always has a recovery administrator.");
            var permissions = (request.Permissions ?? []).Distinct(StringComparer.Ordinal).ToArray();
            var unknown = permissions.Where(permission => !StorePermissions.All.ContainsKey(permission)).ToArray();
            if (unknown.Length > 0) return Results.BadRequest(new { message = "Unknown permission key.", permissions = unknown });
            if (!http.User.IsInRole(StoreRoles.Administrator) &&
                permissions.Any(permission => !http.User.HasClaim(PermissionClaim, permission))) return Results.Forbid();

            var current = (await roles.GetClaimsAsync(role)).Where(claim => claim.Type == PermissionClaim).ToArray();
            foreach (var claim in current)
            {
                var removed = await roles.RemoveClaimAsync(role, claim);
                if (!removed.Succeeded) return Results.BadRequest(string.Join("; ", IdentityErrors(removed)));
            }
            foreach (var permission in permissions)
            {
                var added = await roles.AddClaimAsync(role, new Claim(PermissionClaim, permission));
                if (!added.Succeeded) return Results.BadRequest(string.Join("; ", IdentityErrors(added)));
            }

            // Existing tokens contain a role's old claims. Revoke those tokens so users must
            // sign in again and receive the updated permission set.
            var members = await userManager.GetUsersInRoleAsync(role.Name!);
            foreach (var member in members) await userManager.UpdateSecurityStampAsync(member);
            await transaction.CommitAsync();
            return Results.Ok(new { role.Id, role.Name, permissions });
        }
    }

    private static bool IsSubscriptionAvailable(Store store, DateTimeOffset now) =>
        store.IsActive &&
        ((string.Equals(store.SubscriptionStatus, "Active", StringComparison.OrdinalIgnoreCase) &&
          (!store.SubscriptionExpiresAt.HasValue || store.SubscriptionExpiresAt.Value > now)) ||
         (string.Equals(store.SubscriptionStatus, "Trial", StringComparison.OrdinalIgnoreCase) &&
          store.TrialEndsAt.HasValue && store.TrialEndsAt.Value > now));

    private static List<string> NormalizeRoleNames(IEnumerable<string>? roleNames) =>
        (roleNames ?? []).Where(name => !string.IsNullOrWhiteSpace(name)).Select(name => name.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase).ToList();

    private static async Task<bool> RolesExistAsync(IEnumerable<string> names, RoleManager<IdentityRole> roles)
    {
        foreach (var name in names)
            if (!await roles.RoleExistsAsync(name)) return false;
        return true;
    }

    private static async Task<bool> IsLastActiveAdministratorAsync(UserManager<AppUser> users, AppUser except)
    {
        var administrators = await users.GetUsersInRoleAsync(StoreRoles.Administrator);
        var active = 0;
        foreach (var administrator in administrators)
            if (administrator.Id != except.Id && !await users.IsLockedOutAsync(administrator)) active++;
        return active == 0;
    }

    private static string[] IdentityErrors(IdentityResult result) => result.Errors.Select(error => error.Description).ToArray();

    private sealed record UserSummary(string Id, string Email, IList<string> Roles, bool IsActive, long[] StoreIds);

    private static async Task<IResult> CreateSessionAsync(AppUser user, long storeId, IReadOnlyCollection<StoreMembership> memberships,
        UserManager<AppUser> users, RoleManager<IdentityRole> roles, string jwtKey, string ownerEmail)
    {
        var userRoles = await users.GetRolesAsync(user);
        var permissions = new HashSet<string>(StringComparer.Ordinal);
        foreach (var roleName in userRoles)
        {
            var role = await roles.FindByNameAsync(roleName);
            if (role is null) continue;
            foreach (var claim in await roles.GetClaimsAsync(role))
                if (claim.Type == PermissionClaim && StorePermissions.All.ContainsKey(claim.Value)) permissions.Add(claim.Value);
        }
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.Email, user.Email!),
            new("security_stamp", await users.GetSecurityStampAsync(user) ?? ""),
            new("store_id", storeId.ToString(System.Globalization.CultureInfo.InvariantCulture))
        };
        if (string.Equals(user.Email, ownerEmail, StringComparison.OrdinalIgnoreCase))
            claims.Add(new Claim("app_owner", "true"));
        claims.AddRange(userRoles.Select(role => new Claim(ClaimTypes.Role, role)));
        claims.AddRange(permissions.Select(permission => new Claim(PermissionClaim, permission)));
        var token = new JwtSecurityToken("MedicalStore", "MedicalStore.Web", claims,
            expires: DateTime.UtcNow.AddHours(8), signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)), SecurityAlgorithms.HmacSha256));
        var stores = memberships.Select(x => new StoreSummary(x.StoreId, x.Store.Name, x.Store.Code, x.IsDefault)).ToArray();
        return Results.Ok(new { token = new JwtSecurityTokenHandler().WriteToken(token), userId = user.Id, email = user.Email,
            roles = userRoles, permissions = permissions.Order().ToArray(), activeStoreId = storeId, stores,
            isApplicationOwner = string.Equals(user.Email, ownerEmail, StringComparison.OrdinalIgnoreCase) });
    }

    private static async Task<bool> IsMemberOfStoreAsync(StoreDb db, string userId, CurrentStoreContext currentStore) =>
        currentStore.StoreId is long storeId && await db.UserStores.AnyAsync(x => x.UserId == userId && x.StoreId == storeId);
    private static async Task<bool> CanAssignRolesAsync(ClaimsPrincipal actor, IEnumerable<string> roleNames, RoleManager<IdentityRole> roles)
    {
        if (actor.IsInRole(StoreRoles.Administrator)) return true;
        var actorPermissions = actor.FindAll(PermissionClaim).Select(claim => claim.Value).ToHashSet(StringComparer.Ordinal);
        foreach (var name in roleNames)
        {
            var role = await roles.FindByNameAsync(name);
            if (role is null) return false;
            var permissions = (await roles.GetClaimsAsync(role)).Where(claim => claim.Type == PermissionClaim).Select(claim => claim.Value);
            if (permissions.Any(permission => !actorPermissions.Contains(permission))) return false;
        }
        return true;
    }

    private sealed record RoleSummary(string Id, string Name, string[] Permissions, PermissionSummary[] AvailablePermissions, bool CanAssign);
    private sealed record PermissionSummary(string Key, string Label);
}

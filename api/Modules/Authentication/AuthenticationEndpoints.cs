using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MedicalStore.Api.Infrastructure.Persistence;

namespace MedicalStore.Api.Modules.Authentication;

public static class AuthenticationEndpoints
{
    private const string PermissionClaim = "permission";

    public static void MapAuthenticationEndpoints(this IEndpointRouteBuilder app, string jwtKey)
    {
        app.MapPost("/api/auth/login", LoginAsync).AllowAnonymous();

        var management = app.MapGroup("/api/auth").RequireAuthorization(StorePermissions.UsersManage);
        management.MapGet("/users", ListUsersAsync);
        management.MapPost("/users", CreateUserAsync);
        management.MapPut("/users/{id}/roles", UpdateUserRolesAsync);
        management.MapPut("/users/{id}/status", UpdateUserStatusAsync);
        management.MapGet("/roles", ListRolesAsync);
        management.MapPost("/roles", CreateRoleAsync).RequireAuthorization(StorePermissions.RolesManage);
        management.MapPut("/roles/{id}/permissions", UpdateRolePermissionsAsync).RequireAuthorization(StorePermissions.RolesManage);

        async Task<IResult> LoginAsync(LoginRequest request, UserManager<AppUser> users, RoleManager<IdentityRole> roles)
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
                new("security_stamp", await users.GetSecurityStampAsync(user) ?? "")
            };
            claims.AddRange(userRoles.Select(role => new Claim(ClaimTypes.Role, role)));
            claims.AddRange(permissions.Select(permission => new Claim(PermissionClaim, permission)));

            var token = new JwtSecurityToken("MedicalStore", "MedicalStore.Web", claims,
                expires: DateTime.UtcNow.AddHours(8), signingCredentials: new SigningCredentials(
                    new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)), SecurityAlgorithms.HmacSha256));
            return Results.Ok(new { token = new JwtSecurityTokenHandler().WriteToken(token), email = user.Email,
                roles = userRoles, permissions = permissions.Order().ToArray() });
        }

        static async Task<IResult> ListUsersAsync(UserManager<AppUser> users)
        {
            var result = new List<UserSummary>();
            foreach (var user in await users.Users.OrderBy(x => x.Email).ToListAsync())
                result.Add(new UserSummary(user.Id, user.Email ?? user.UserName ?? "", await users.GetRolesAsync(user), !await users.IsLockedOutAsync(user)));
            return Results.Ok(result);
        }

        static async Task<IResult> CreateUserAsync(CreateStoreUserRequest request, UserManager<AppUser> users,
            RoleManager<IdentityRole> roles, StoreDb db, HttpContext http)
        {
            var email = request.Email?.Trim() ?? "";
            var roleNames = NormalizeRoleNames(request.Roles);
            if (string.IsNullOrWhiteSpace(email) || !email.Contains('@') || string.IsNullOrWhiteSpace(request.Password) || roleNames.Count == 0)
                return Results.BadRequest("A valid email, password and at least one role are required.");
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
            await transaction.CommitAsync();
            return Results.Created($"/api/auth/users/{user.Id}", new UserSummary(user.Id, email, roleNames, true));
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
            return Results.Ok(new UserSummary(user.Id, user.Email ?? "", nextRoles, !await users.IsLockedOutAsync(user)));
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
            return Results.Ok(new UserSummary(user.Id, user.Email ?? "", userRoles, request.IsActive));
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

    private sealed record UserSummary(string Id, string Email, IList<string> Roles, bool IsActive);
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

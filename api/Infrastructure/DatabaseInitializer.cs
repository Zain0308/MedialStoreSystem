using MedicalStore.Api.Modules.Authentication;
using MedicalStore.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.RegularExpressions;

namespace MedicalStore.Api.Infrastructure;

public static class DatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services, IConfiguration configuration)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDb>();
        await db.Database.EnsureCreatedAsync();
        await ApplySchemaUpgradesAsync(db);
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        await SeedRolesAsync(roles);
        var adminEmail = configuration["Bootstrap:Email"];
        var adminPassword = configuration["Bootstrap:Password"];
        if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
            throw new InvalidOperationException("Bootstrap__Email and Bootstrap__Password are required.");
        if (await users.FindByEmailAsync(adminEmail) is null)
        {
            var result = await users.CreateAsync(new AppUser { UserName = adminEmail, Email = adminEmail, EmailConfirmed = true, LockoutEnabled = true }, adminPassword);
            if (!result.Succeeded) throw new InvalidOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));
        }

        var owner = await users.FindByEmailAsync(adminEmail)
            ?? throw new InvalidOperationException("The bootstrap owner could not be loaded.");
        if (!await users.IsInRoleAsync(owner, StoreRoles.Administrator))
        {
            var result = await users.AddToRoleAsync(owner, StoreRoles.Administrator);
            if (!result.Succeeded) throw new InvalidOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));
        }

        var defaultStore = await db.Stores.SingleAsync(x => x.Code == "MAIN");
        if (!await db.UserStores.AnyAsync(x => x.UserId == owner.Id))
        {
            db.UserStores.Add(new MedicalStore.Api.Modules.Stores.StoreMembership
            {
                UserId = owner.Id, StoreId = defaultStore.Id, IsDefault = true
            });
            await db.SaveChangesAsync();
        }
    }

    private static async Task ApplySchemaUpgradesAsync(StoreDb db)
    {
        var assembly = typeof(DatabaseInitializer).Assembly;
        var scripts = assembly.GetManifestResourceNames()
            .Select(name => (Name: name, Match: Regex.Match(name, @"\.Database\.upgrade-v(?<version>\d+)\.sql$", RegexOptions.IgnoreCase)))
            .Where(item => item.Match.Success)
            .OrderBy(item => int.Parse(item.Match.Groups["version"].Value))
            .ToArray();
        if (scripts.Length == 0) throw new InvalidOperationException("No embedded database upgrade scripts were found.");

        foreach (var (resourceName, _) in scripts)
        {
            await using var stream = assembly.GetManifestResourceStream(resourceName)
                ?? throw new InvalidOperationException($"Could not open embedded database upgrade script '{resourceName}'.");
            using var reader = new StreamReader(stream);
            await db.Database.ExecuteSqlRawAsync(await reader.ReadToEndAsync());
        }
    }

    private static async Task SeedRolesAsync(RoleManager<IdentityRole> roles)
    {
        foreach (var (name, permissions) in StorePermissions.DefaultRoles)
        {
            var role = await roles.FindByNameAsync(name);
            var createdNewRole = false;
            if (role is null)
            {
                role = new IdentityRole(name);
                var created = await roles.CreateAsync(role);
                if (!created.Succeeded) throw new InvalidOperationException(string.Join("; ", created.Errors.Select(e => e.Description)));
                createdNewRole = true;
            }

            // The Administrator role is the fixed recovery role; other built-in role permissions
            // can be adjusted by a store administrator after initialization.
            if (name != StoreRoles.Administrator && !createdNewRole) continue;
            var existing = (await roles.GetClaimsAsync(role))
                .Where(claim => claim.Type == "permission")
                .Select(claim => claim.Value)
                .ToHashSet(StringComparer.Ordinal);
            foreach (var permission in permissions.Where(permission => !existing.Contains(permission)))
            {
                var added = await roles.AddClaimAsync(role, new Claim("permission", permission));
                if (!added.Succeeded) throw new InvalidOperationException(string.Join("; ", added.Errors.Select(e => e.Description)));
            }
        }
    }
}

using MedicalStore.Api.Modules.Authentication;
using MedicalStore.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace MedicalStore.Api.Infrastructure;

public static class DatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services, IConfiguration configuration)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreDb>();
        await db.Database.EnsureCreatedAsync();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var adminEmail = configuration["Bootstrap:Email"];
        var adminPassword = configuration["Bootstrap:Password"];
        if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
            throw new InvalidOperationException("Bootstrap__Email and Bootstrap__Password are required.");
        if (await users.FindByEmailAsync(adminEmail) is null)
        {
            var result = await users.CreateAsync(new AppUser { UserName = adminEmail, Email = adminEmail, EmailConfirmed = true, LockoutEnabled = true }, adminPassword);
            if (!result.Succeeded) throw new InvalidOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));
        }
    }
}

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;

namespace MedicalStore.Api;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app, string jwtKey)
    {
        app.MapPost("/api/auth/login", async (LoginRequest request, UserManager<AppUser> users) =>
        {
            var user = await users.FindByEmailAsync(request.Email);
            if (user is null || await users.IsLockedOutAsync(user)) return Results.Unauthorized();
            if (!await users.CheckPasswordAsync(user, request.Password))
            {
                await users.AccessFailedAsync(user);
                return Results.Unauthorized();
            }
            await users.ResetAccessFailedCountAsync(user);
            var claims = new[] { new Claim(JwtRegisteredClaimNames.Sub, user.Id), new Claim(JwtRegisteredClaimNames.Email, user.Email!) };
            var token = new JwtSecurityToken("MedicalStore", "MedicalStore.Web", claims,
                expires: DateTime.UtcNow.AddHours(8), signingCredentials: new SigningCredentials(
                    new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)), SecurityAlgorithms.HmacSha256));
            return Results.Ok(new { token = new JwtSecurityTokenHandler().WriteToken(token), email = user.Email });
        });
    }
}

using System.Text;
using MedicalStore.Api;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration.GetConnectionString("Store")
    ?? throw new InvalidOperationException("ConnectionStrings__Store is required.");
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt__Key is required.");
if (Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Jwt__Key must contain at least 32 UTF-8 bytes.");

builder.Services.AddDbContext<StoreDb>(o => o.UseSqlServer(connection));
builder.Services.AddIdentityCore<AppUser>(o =>
{
    o.Password.RequiredLength = 12;
    o.Password.RequireNonAlphanumeric = true;
    o.Lockout.MaxFailedAccessAttempts = 5;
    o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
}).AddEntityFrameworkStores<StoreDb>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = "MedicalStore",
        ValidateAudience = true, ValidAudience = "MedicalStore.Web",
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromSeconds(30)
    };
});
builder.Services.AddAuthorization();
builder.Services.AddCors(o => o.AddPolicy("LocalWeb", p => p.WithOrigins("http://localhost:4200").AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors("LocalWeb");
app.UseAuthentication();
app.UseAuthorization();

// First version uses EnsureCreated for a fresh local database. Move to EF migrations before schema changes.
await DatabaseInitializer.InitializeAsync(app.Services, app.Configuration);

app.MapAuthEndpoints(jwtKey);
var api = app.MapGroup("/api").RequireAuthorization();
api.MapDashboardEndpoints();
api.MapCatalogEndpoints();
api.MapInventoryEndpoints();
api.MapPurchaseEndpoints();
api.MapSaleEndpoints();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.Run();

using System.Text;
using MedicalStore.Api.Modules;
using MedicalStore.Api.Modules.Authentication;
using MedicalStore.Api.Infrastructure;
using MedicalStore.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration.GetConnectionString("Store")
    ?? throw new InvalidOperationException("ConnectionStrings__Store is required.");
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Jwt__Key is required.");
if (Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Jwt__Key must contain at least 32 UTF-8 bytes.");

builder.Services.AddDbContext<StoreDb>(o => o.UseSqlServer(connection));
builder.Services.AddScoped<CurrentStoreContext>();
builder.Services.AddAuthenticationModule(jwtKey);
builder.Services.AddCors(o => o.AddPolicy("LocalWeb", p => p.WithOrigins("http://localhost:4200").AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors("LocalWeb");
app.UseAuthentication();
app.UseAuthorization();

// Create a fresh database when needed, then apply the idempotent schema upgrade for existing databases.
await DatabaseInitializer.InitializeAsync(app.Services, app.Configuration);

app.MapMedicalStoreModules(jwtKey);

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.Run();

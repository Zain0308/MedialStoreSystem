using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<StoreDb>();
    await db.Database.EnsureCreatedAsync();
    var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
    var adminEmail = builder.Configuration["Bootstrap:Email"];
    var adminPassword = builder.Configuration["Bootstrap:Password"];
    if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
        throw new InvalidOperationException("Bootstrap__Email and Bootstrap__Password are required.");
    if (await users.FindByEmailAsync(adminEmail) is null)
    {
        var result = await users.CreateAsync(new AppUser { UserName = adminEmail, Email = adminEmail, EmailConfirmed = true, LockoutEnabled = true }, adminPassword);
        if (!result.Succeeded) throw new InvalidOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));
    }
}

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

var api = app.MapGroup("/api").RequireAuthorization();

api.MapGet("/dashboard", async (StoreDb db) =>
{
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    var start = new DateTimeOffset(DateTime.UtcNow.Date, TimeSpan.Zero);
    return Results.Ok(new
    {
        todaySales = await db.Sales.Where(x => x.CreatedAt >= start).SumAsync(x => (decimal?)x.Total) ?? 0,
        todayInvoices = await db.Sales.CountAsync(x => x.CreatedAt >= start),
        medicineCount = await db.Medicines.CountAsync(),
        expiringBatches = await db.Batches.CountAsync(x => x.Quantity > 0 && x.ExpiryDate >= today && x.ExpiryDate <= today.AddDays(60)),
        expiredBatches = await db.Batches.CountAsync(x => x.Quantity > 0 && x.ExpiryDate < today)
    });
});

api.MapGet("/medicines", async (StoreDb db) =>
{
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    return Results.Ok(await db.Medicines.OrderBy(x => x.Name).Select(x => new
    {
        x.Id, x.Name, x.GenericName, x.Barcode, x.RequiresPrescription, x.MinimumStock, x.IsActive,
        stock = x.Batches.Where(b => b.ExpiryDate >= today).Sum(b => b.Quantity)
    }).ToListAsync());
});

api.MapPost("/medicines", async (MedicineRequest input, StoreDb db) =>
{
    if (string.IsNullOrWhiteSpace(input.Name) || input.MinimumStock < 0) return Results.BadRequest("Name and nonnegative minimum stock are required.");
    var barcode = string.IsNullOrWhiteSpace(input.Barcode) ? null : input.Barcode.Trim();
    if (barcode is not null && await db.Medicines.AnyAsync(x => x.Barcode == barcode)) return Results.Conflict("Barcode already exists.");
    var medicine = new Medicine { Name = input.Name.Trim(), GenericName = input.GenericName?.Trim(), Barcode = barcode,
        MinimumStock = input.MinimumStock, RequiresPrescription = input.RequiresPrescription };
    db.Medicines.Add(medicine);
    await db.SaveChangesAsync();
    return Results.Created($"/api/medicines/{medicine.Id}", new { medicine.Id });
});

api.MapGet("/suppliers", async (StoreDb db) => Results.Ok(await db.Suppliers.OrderBy(x => x.Name).ToListAsync()));
api.MapPost("/suppliers", async (SupplierRequest input, StoreDb db) =>
{
    if (string.IsNullOrWhiteSpace(input.Name)) return Results.BadRequest("Supplier name is required.");
    var supplier = new Supplier { Name = input.Name.Trim(), Phone = input.Phone?.Trim() };
    db.Suppliers.Add(supplier);
    await db.SaveChangesAsync();
    return Results.Created($"/api/suppliers/{supplier.Id}", new { supplier.Id });
});

api.MapGet("/inventory", async (StoreDb db) => Results.Ok(await db.Batches
    .OrderBy(x => x.ExpiryDate).Select(x => new { x.Id, medicineId = x.MedicineId, medicine = x.Medicine.Name,
        x.Number, x.ExpiryDate, x.CostPrice, x.SalePrice, x.Quantity }).ToListAsync()));

api.MapPost("/purchases", async (PurchaseRequest input, StoreDb db) =>
{
    if (string.IsNullOrWhiteSpace(input.SupplierInvoice) || input.Lines is null || input.Lines.Count == 0 ||
        input.Lines.Any(x => x.Quantity <= 0 || x.CostPrice < 0 || x.SalePrice < 0 ||
            x.ExpiryDate < DateOnly.FromDateTime(DateTime.UtcNow) || string.IsNullOrWhiteSpace(x.BatchNumber)))
        return Results.BadRequest("Invoice, lines, positive quantities, valid prices and future expiry are required.");
    if (!await db.Suppliers.AnyAsync(x => x.Id == input.SupplierId)) return Results.BadRequest("Supplier not found.");
    var ids = input.Lines.Select(x => x.MedicineId).Distinct().ToArray();
    if (await db.Medicines.CountAsync(x => ids.Contains(x.Id) && x.IsActive) != ids.Length) return Results.BadRequest("Medicine not found or inactive.");
    var invoice = input.SupplierInvoice.Trim();
    if (await db.Purchases.AnyAsync(x => x.SupplierId == input.SupplierId && x.SupplierInvoice == invoice))
        return Results.Conflict("Supplier invoice already received.");

    await using var tx = await db.Database.BeginTransactionAsync();
    var purchase = new Purchase { SupplierId = input.SupplierId, SupplierInvoice = invoice,
        Total = decimal.Round(input.Lines.Sum(x => x.Quantity * x.CostPrice), 2) };
    foreach (var line in input.Lines)
    {
        var batch = new Batch { MedicineId = line.MedicineId, Number = line.BatchNumber.Trim(),
            ExpiryDate = line.ExpiryDate, CostPrice = line.CostPrice, SalePrice = line.SalePrice, Quantity = line.Quantity };
        purchase.Lines.Add(new PurchaseLine { Batch = batch, Quantity = line.Quantity, UnitCost = line.CostPrice });
    }
    db.Purchases.Add(purchase);
    await db.SaveChangesAsync();
    foreach (var line in purchase.Lines)
        db.StockMovements.Add(new StockMovement { BatchId = line.BatchId, Type = "Purchase", ReferenceId = purchase.Id,
            QuantityChange = line.Quantity, BalanceAfter = line.Quantity });
    await db.SaveChangesAsync();
    await tx.CommitAsync();
    return Results.Created($"/api/purchases/{purchase.Id}", new { purchase.Id, purchase.Total });
});

api.MapPost("/sales", async (SaleRequest input, StoreDb db, ClaimsPrincipal principal) =>
{
    if (input.Lines is null || input.Lines.Count == 0 || input.Lines.Any(x => x.Quantity <= 0) || input.CashReceived < 0)
        return Results.BadRequest("Select items, enter positive quantities and valid cash received.");
    var wanted = input.Lines.GroupBy(x => x.MedicineId).Select(x => new SaleRequestLine(x.Key, x.Sum(y => y.Quantity))).ToArray();
    await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
    var ids = wanted.Select(x => x.MedicineId).ToArray();
    var medicines = await db.Medicines.Where(x => ids.Contains(x.Id)).ToListAsync();
    if (medicines.Count != ids.Length || medicines.Any(x => !x.IsActive || x.RequiresPrescription))
        return Results.BadRequest("Medicine is unavailable or requires a prescription workflow.");
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    var batches = await db.Batches.Where(x => ids.Contains(x.MedicineId) && x.ExpiryDate >= today && x.Quantity > 0)
        .OrderBy(x => x.ExpiryDate).ThenBy(x => x.Id).ToListAsync();
    var sale = new Sale { InvoiceNumber = $"TMP-{Guid.NewGuid():N}", CashReceived = input.CashReceived,
        CashierId = principal.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? "" };
    var movements = new List<(Batch batch, int taken)>();
    foreach (var item in wanted)
    {
        var remaining = item.Quantity;
        foreach (var batch in batches.Where(x => x.MedicineId == item.MedicineId))
        {
            if (remaining == 0) break;
            var taken = Math.Min(batch.Quantity, remaining);
            if (taken == 0) continue;
            batch.Quantity -= taken;
            remaining -= taken;
            sale.Lines.Add(new SaleLine { BatchId = batch.Id, Quantity = taken, UnitPrice = batch.SalePrice, UnitCost = batch.CostPrice });
            movements.Add((batch, taken));
        }
        if (remaining > 0) return Results.Conflict($"Insufficient available stock for medicine {item.MedicineId}.");
    }
    sale.Total = decimal.Round(sale.Lines.Sum(x => x.UnitPrice * x.Quantity), 2);
    if (input.CashReceived < sale.Total) return Results.BadRequest($"Cash received must be at least {sale.Total:0.00}.");
    db.Sales.Add(sale);
    await db.SaveChangesAsync();
    sale.InvoiceNumber = $"INV-{sale.Id:D8}";
    foreach (var (batch, taken) in movements)
        db.StockMovements.Add(new StockMovement { BatchId = batch.Id, Type = "Sale", ReferenceId = sale.Id,
            QuantityChange = -taken, BalanceAfter = batch.Quantity });
    await db.SaveChangesAsync();
    await tx.CommitAsync();
    return Results.Created($"/api/sales/{sale.Id}", new { sale.Id, sale.InvoiceNumber, sale.Total, change = sale.CashReceived - sale.Total });
});

api.MapGet("/sales", async (StoreDb db) => Results.Ok(await db.Sales.OrderByDescending(x => x.Id)
    .Take(50).Select(x => new { x.Id, x.InvoiceNumber, x.CreatedAt, x.Total }).ToListAsync()));

api.MapGet("/sales/{id:long}", async (long id, StoreDb db) =>
{
    var sale = await db.Sales.Where(x => x.Id == id).Select(x => new
    {
        x.Id, x.InvoiceNumber, x.CreatedAt, x.Total, x.CashReceived,
        lines = x.Lines.Select(y => new { medicine = y.Batch.Medicine.Name, batch = y.Batch.Number,
            y.Quantity, y.UnitPrice, total = y.Quantity * y.UnitPrice })
    }).SingleOrDefaultAsync();
    return sale is null ? Results.NotFound() : Results.Ok(sale);
});

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.Run();

record LoginRequest(string Email, string Password);
record MedicineRequest(string Name, string? GenericName, string? Barcode, int MinimumStock, bool RequiresPrescription);
record SupplierRequest(string Name, string? Phone);
record PurchaseRequest(long SupplierId, string SupplierInvoice, List<PurchaseRequestLine> Lines);
record PurchaseRequestLine(long MedicineId, string BatchNumber, DateOnly ExpiryDate, int Quantity, decimal CostPrice, decimal SalePrice);
record SaleRequest(List<SaleRequestLine> Lines, decimal CashReceived);
record SaleRequestLine(long MedicineId, int Quantity);

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace MedicalStore.Api;

public static class SaleEndpoints
{
    public static void MapSaleEndpoints(this RouteGroupBuilder api)
    {
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
    }
}

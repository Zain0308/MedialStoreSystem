using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Authentication;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace MedicalStore.Api.Modules.Inventory;

public static class InventoryEndpoints
{
    public static void MapInventoryEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/inventory", async (StoreDb db) => Results.Ok(await db.Batches
            .OrderBy(x => x.ExpiryDate).Select(x => new { x.Id, medicineId = x.MedicineId, medicine = x.Medicine.Name,
                x.Number, x.ExpiryDate, x.CostPrice, x.SalePrice, x.Quantity }).ToListAsync()))
            .RequireAuthorization(StorePermissions.InventoryRead);

        api.MapPost("/inventory/adjustments", async (StockAdjustmentRequest input, StoreDb db, ClaimsPrincipal principal) =>
        {
            var requestedType = input.Type?.Trim();
            var type = string.Equals(requestedType, "Damage", StringComparison.OrdinalIgnoreCase) ? "Damage" :
                string.Equals(requestedType, "Adjustment", StringComparison.OrdinalIgnoreCase) ? "Adjustment" : null;
            if (input.QuantityChange == 0 || string.IsNullOrWhiteSpace(input.Reason) ||
                type is null || (type == "Damage" && input.QuantityChange > 0))
                return Results.BadRequest("A nonzero quantity change and reason are required.");
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var batch = await db.Batches.SingleOrDefaultAsync(x => x.Id == input.BatchId);
            if (batch is null) return Results.NotFound("Batch not found.");
            if (batch.Quantity + input.QuantityChange < 0)
                return Results.Conflict("Adjustment cannot reduce saleable stock below zero.");
            batch.Quantity += input.QuantityChange;
            db.StockMovements.Add(new StockMovement
            {
                BatchId = batch.Id, Type = type,
                QuantityChange = input.QuantityChange, BalanceAfter = batch.Quantity, Reason = input.Reason.Trim(),
                ActorId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { batch.Id, batch.Quantity });
        }).RequireAuthorization(StorePermissions.InventoryManage);

        api.MapGet("/inventory/movements", async (StoreDb db, long? batchId, int? take) =>
        {
            var query = db.StockMovements.AsNoTracking().AsQueryable();
            if (batchId.HasValue) query = query.Where(x => x.BatchId == batchId.Value);
            var limit = Math.Clamp(take ?? 100, 1, 500);
            return Results.Ok(await query.OrderByDescending(x => x.CreatedAt).Take(limit)
                .Select(x => new { x.Id, x.BatchId, medicine = x.Batch.Medicine.Name, batch = x.Batch.Number,
                    x.Type, x.QuantityChange, x.BalanceAfter, x.Reason, x.CreatedAt }).ToListAsync());
        }).RequireAuthorization(StorePermissions.InventoryRead);
    }
}

public sealed record StockAdjustmentRequest(long BatchId, int QuantityChange, string Reason, string Type = "Adjustment");

using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Authentication;
using MedicalStore.Api.Modules.Purchases;
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

        api.MapGet("/inventory/medicines/{medicineId:long}/details", async (long medicineId, StoreDb db) =>
        {
            var medicine = await db.Medicines.AsNoTracking().Where(x => x.Id == medicineId)
                .Select(x => new { x.Id, x.Name, x.GenericName, x.Barcode, x.Strength, x.DosageForm,
                    x.Manufacturer, x.Description, x.MinimumStock, x.IsActive }).SingleOrDefaultAsync();
            if (medicine is null) return Results.NotFound("Medicine not found.");

            var batches = await db.Batches.AsNoTracking().Where(x => x.MedicineId == medicineId)
                .OrderBy(x => x.ExpiryDate).Select(x => new { x.Id, x.Number, x.ExpiryDate, x.CostPrice,
                    x.SalePrice, x.Quantity }).ToListAsync();
            var purchaseLines = await db.PurchaseLines.AsNoTracking().Where(x => x.Batch.MedicineId == medicineId)
                .OrderByDescending(x => x.Purchase.CreatedAt).Select(x => new
                {
                    purchaseId = x.PurchaseId, purchaseLineId = x.Id, batchId = x.BatchId, batch = x.Batch.Number,
                    expiryDate = x.Batch.ExpiryDate, onHand = x.Batch.Quantity, salePrice = x.Batch.SalePrice,
                    supplier = x.Purchase.Supplier.Name, supplierInvoice = x.Purchase.SupplierInvoice,
                    purchasedAt = x.Purchase.CreatedAt, x.Quantity, x.ReturnedQuantity, x.UnitCost,
                    invoiceTotal = x.Purchase.Total,
                    invoicePaid = x.Purchase.Payments.Where(p => p.Method != "Supplier Credit")
                        .Sum(p => (decimal?)p.Amount) ?? 0m,
                    invoiceReturned = x.Purchase.Returns.Sum(r => (decimal?)r.Total) ?? 0m
                }).ToListAsync();
            var purchaseIds = purchaseLines.Select(x => x.purchaseId).Distinct().ToArray();
            var payments = await db.SupplierPayments.AsNoTracking()
                .Where(x => purchaseIds.Contains(x.PurchaseId))
                .OrderByDescending(x => x.PaidAt).Select(x => new
                {
                    x.Id, supplierInvoice = x.Purchase.SupplierInvoice, supplier = x.Purchase.Supplier.Name,
                    x.Amount, x.Method, x.Reference, x.PaidAt
                }).ToListAsync();
            var returns = await db.PurchaseReturnLines.AsNoTracking()
                .Where(x => x.PurchaseLine.Batch.MedicineId == medicineId)
                .OrderByDescending(x => x.PurchaseReturn.CreatedAt).Select(x => new
                {
                    x.Id, supplierInvoice = x.PurchaseReturn.Purchase.SupplierInvoice,
                    supplier = x.PurchaseReturn.Purchase.Supplier.Name,
                    x.PurchaseReturn.SupplierReference, x.PurchaseReturn.Reason, x.PurchaseReturn.CreatedAt,
                    x.Quantity, x.UnitCost, total = x.Quantity * x.UnitCost
                }).ToListAsync();
            var corrections = await db.PurchaseCorrectionLines.AsNoTracking()
                .Where(x => x.PurchaseLine.Batch.MedicineId == medicineId)
                .OrderByDescending(x => x.PurchaseCorrection.CreatedAt).Select(x => new
                {
                    x.Id, supplierInvoice = x.PurchaseCorrection.Purchase.SupplierInvoice,
                    batch = x.PurchaseLine.Batch.Number, x.PurchaseCorrection.Reason,
                    x.PurchaseCorrection.CreatedAt, x.PreviousQuantity, x.CorrectedQuantity, x.QuantityChange
                }).ToListAsync();

            return Results.Ok(new { medicine, batches, purchases = purchaseLines, payments, returns, corrections });
        }).RequireAuthorization(StorePermissions.InventoryRead);

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

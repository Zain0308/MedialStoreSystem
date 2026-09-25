using MedicalStore.Api.Modules.Inventory;
using MedicalStore.Api.Modules.Authentication;
using MedicalStore.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace MedicalStore.Api.Modules.Purchases;

public static class PurchaseEndpoints
{
    public static void MapPurchaseEndpoints(this RouteGroupBuilder api)
    {
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
        }).RequireAuthorization(StorePermissions.PurchasesManage);
    }
}

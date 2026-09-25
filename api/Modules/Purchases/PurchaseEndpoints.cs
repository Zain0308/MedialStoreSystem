using MedicalStore.Api.Modules.Inventory;
using MedicalStore.Api.Modules.Authentication;
using MedicalStore.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

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
            if (!await db.Suppliers.AnyAsync(x => x.Id == input.SupplierId && x.IsActive)) return Results.BadRequest("Supplier not found or inactive.");
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
                    QuantityChange = line.Quantity, BalanceAfter = line.Quantity, Reason = $"Supplier invoice {purchase.SupplierInvoice}" });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created($"/api/purchases/{purchase.Id}", new { purchase.Id, purchase.Total });
        }).RequireAuthorization(StorePermissions.PurchasesManage);

        api.MapGet("/purchases", async (StoreDb db) => Results.Ok(await db.Purchases.AsNoTracking()
            .OrderByDescending(x => x.Id).Take(100).Select(x => new
            {
                x.Id, supplier = x.Supplier.Name, x.SupplierInvoice, x.CreatedAt, x.Total,
                returnedTotal = x.Returns.Sum(r => (decimal?)r.Total) ?? 0,
                paidTotal = x.Payments.Sum(p => (decimal?)p.Amount) ?? 0,
                lines = x.Lines.Select(l => new { l.Id, medicine = l.Batch.Medicine.Name, batch = l.Batch.Number,
                    l.Quantity, l.ReturnedQuantity, l.UnitCost, onHand = l.Batch.Quantity }),
                returns = x.Returns.OrderByDescending(r => r.Id).Select(r => new { r.Id, r.SupplierReference, r.Reason, r.CreatedAt, r.Total }),
                payments = x.Payments.OrderByDescending(p => p.Id).Select(p => new { p.Id, p.Amount, p.Method, p.Reference, p.PaidAt })
            }).ToListAsync())).RequireAuthorization(StorePermissions.PurchasesRead);

        api.MapGet("/purchases/supplier-accounts", async (StoreDb db) =>
        {
            var suppliers = await db.Suppliers.AsNoTracking().Select(x => new { x.Id, x.Name }).ToListAsync();
            var purchases = await db.Purchases.AsNoTracking().Select(x => new { x.SupplierId, x.Total }).ToListAsync();
            var returns = await db.PurchaseReturns.AsNoTracking()
                .Select(x => new { x.Purchase.SupplierId, x.Total }).ToListAsync();
            var payments = await db.SupplierPayments.AsNoTracking()
                .Select(x => new { x.Purchase.SupplierId, x.Amount }).ToListAsync();
            var purchaseTotals = purchases.GroupBy(x => x.SupplierId)
                .ToDictionary(x => x.Key, x => x.Sum(item => item.Total));
            var returnTotals = returns.GroupBy(x => x.SupplierId)
                .ToDictionary(x => x.Key, x => x.Sum(item => item.Total));
            var paidTotals = payments.GroupBy(x => x.SupplierId)
                .ToDictionary(x => x.Key, x => x.Sum(item => item.Amount));
            var invoiceCounts = purchases.GroupBy(x => x.SupplierId)
                .ToDictionary(x => x.Key, x => x.Count());

            return Results.Ok(suppliers.Select(supplier =>
            {
                var purchaseTotal = purchaseTotals.GetValueOrDefault(supplier.Id);
                var returnedTotal = returnTotals.GetValueOrDefault(supplier.Id);
                var paidTotal = paidTotals.GetValueOrDefault(supplier.Id);
                return new SupplierAccountSummary(supplier.Id, supplier.Name, invoiceCounts.GetValueOrDefault(supplier.Id),
                    purchaseTotal, returnedTotal, paidTotal, Math.Max(0m, purchaseTotal - returnedTotal - paidTotal));
            }));
        }).RequireAuthorization(StorePermissions.PurchasesRead);

        api.MapGet("/purchases/suppliers/{supplierId:long}/statement", async (long supplierId, StoreDb db) =>
        {
            var supplier = await db.Suppliers.AsNoTracking().Where(x => x.Id == supplierId)
                .Select(x => new { x.Id, x.Name }).SingleOrDefaultAsync();
            if (supplier is null) return Results.NotFound("Supplier not found in this store.");
            var invoices = await db.Purchases.AsNoTracking().Where(x => x.SupplierId == supplierId)
                .OrderByDescending(x => x.CreatedAt).Select(x => new
                {
                    x.Id, supplier = x.Supplier.Name, x.SupplierInvoice, x.CreatedAt, x.Total,
                    returnedTotal = x.Returns.Sum(r => (decimal?)r.Total) ?? 0,
                    paidTotal = x.Payments.Sum(p => (decimal?)p.Amount) ?? 0,
                    lines = x.Lines.Select(l => new { l.Id, medicine = l.Batch.Medicine.Name, batch = l.Batch.Number,
                        l.Quantity, l.ReturnedQuantity, l.UnitCost, onHand = l.Batch.Quantity }),
                    returns = x.Returns.OrderByDescending(r => r.CreatedAt)
                        .Select(r => new { r.Id, r.SupplierReference, r.Reason, r.CreatedAt, r.Total }),
                    payments = x.Payments.OrderByDescending(p => p.PaidAt)
                        .Select(p => new { p.Id, p.Amount, p.Method, p.Reference, p.PaidAt })
                }).ToListAsync();
            return Results.Ok(new { supplierId = supplier.Id, supplier = supplier.Name, invoices });
        }).RequireAuthorization(StorePermissions.PurchasesRead);

        api.MapPost("/purchases/{id:long}/returns", async (long id, PurchaseReturnRequest input, StoreDb db, ClaimsPrincipal principal) =>
        {
            if (string.IsNullOrWhiteSpace(input.SupplierReference) || string.IsNullOrWhiteSpace(input.Reason) ||
                input.Lines is null || input.Lines.Count == 0 || input.Lines.Any(x => x.Quantity <= 0))
                return Results.BadRequest("Supplier reference, return reason and positive line quantities are required.");
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var purchase = await db.Purchases.Include(x => x.Lines).ThenInclude(x => x.Batch)
                .SingleOrDefaultAsync(x => x.Id == id);
            if (purchase is null) return Results.NotFound();
            var requested = input.Lines.GroupBy(x => x.PurchaseLineId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToArray();
            var byId = purchase.Lines.ToDictionary(x => x.Id);
            foreach (var line in requested)
            {
                if (!byId.TryGetValue(line.Id, out var purchaseLine)) return Results.BadRequest("Purchase line does not belong to this invoice.");
                if (line.Quantity > purchaseLine.Quantity - purchaseLine.ReturnedQuantity || line.Quantity > purchaseLine.Batch.Quantity)
                    return Results.Conflict("Return quantity exceeds the unreturned purchase quantity or current stock on hand.");
            }
            var result = new PurchaseReturn { PurchaseId = id, SupplierReference = input.SupplierReference.Trim(), Reason = input.Reason.Trim() };
            foreach (var request in requested)
            {
                var line = byId[request.Id];
                line.ReturnedQuantity += request.Quantity;
                line.Batch.Quantity -= request.Quantity;
                result.Lines.Add(new PurchaseReturnLine { PurchaseLineId = line.Id, BatchId = line.BatchId,
                    Quantity = request.Quantity, UnitCost = line.UnitCost });
                db.StockMovements.Add(new StockMovement { BatchId = line.BatchId, Type = "PurchaseReturn", ReferenceId = id,
                    QuantityChange = -request.Quantity, BalanceAfter = line.Batch.Quantity, Reason = input.Reason.Trim(),
                    ActorId = principal.FindFirstValue(ClaimTypes.NameIdentifier) });
            }
            result.Total = decimal.Round(result.Lines.Sum(x => x.Quantity * x.UnitCost), 2);
            db.PurchaseReturns.Add(result);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created($"/api/purchases/{id}/returns/{result.Id}", new { result.Id, result.Total });
        }).RequireAuthorization(StorePermissions.PurchasesManage);

        api.MapPost("/purchases/{id:long}/payments", async (long id, SupplierPaymentRequest input, StoreDb db) =>
        {
            var method = input.Method?.Trim();
            var methods = new[] { "Cash", "Card", "Bank Transfer", "Mobile Wallet" };
            var amount = decimal.Round(input.Amount, 2);
            if (amount <= 0 || method is null || !methods.Contains(method, StringComparer.OrdinalIgnoreCase))
                return Results.BadRequest("Enter a positive payment and a supported payment method.");
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var purchase = await db.Purchases.Include(x => x.Returns).Include(x => x.Payments).SingleOrDefaultAsync(x => x.Id == id);
            if (purchase is null) return Results.NotFound();
            var outstanding = purchase.Total - purchase.Returns.Sum(x => x.Total) - purchase.Payments.Sum(x => x.Amount);
            if (amount > outstanding) return Results.BadRequest($"Payment exceeds the outstanding balance of {Math.Max(0, outstanding):0.00}.");
            var payment = new SupplierPayment { PurchaseId = id, Amount = amount, Method = method,
                Reference = input.Reference?.Trim() };
            db.SupplierPayments.Add(payment);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created($"/api/purchases/{id}/payments/{payment.Id}", new { payment.Id, payment.Amount, payment.Method });
        }).RequireAuthorization(StorePermissions.PurchasesManage);
    }
}

public sealed record SupplierAccountSummary(long SupplierId, string Supplier, int InvoiceCount,
    decimal PurchaseTotal, decimal ReturnedTotal, decimal PaidTotal, decimal Balance);

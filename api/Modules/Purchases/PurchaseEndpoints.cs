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
                    x.ExpiryDate <= DateOnly.FromDateTime(DateTime.UtcNow) || string.IsNullOrWhiteSpace(x.BatchNumber)))
                return Results.BadRequest("Invoice, lines, positive quantities, valid prices and future expiry are required.");
            var paymentAmount = decimal.Round(input.PaymentAmount, 2);
            var paymentMethod = input.PaymentMethod?.Trim();
            var paymentMethods = new[] { "Cash", "Bank Transfer", "Credit" };
            var normalizedPaymentMethod = paymentMethods.FirstOrDefault(x =>
                string.Equals(x, paymentMethod, StringComparison.OrdinalIgnoreCase));
            if (paymentAmount < 0 || paymentAmount > 0 && normalizedPaymentMethod is null)
                return Results.BadRequest("Payment amount cannot be negative. Select a payment method when recording a payment.");
            if (paymentAmount > 0 && normalizedPaymentMethod == "Credit")
                return Results.BadRequest("Credit means no payment is being made now; enter a payment amount only for Cash or Bank Transfer.");
            if (!await db.Suppliers.AnyAsync(x => x.Id == input.SupplierId && x.IsActive)) return Results.BadRequest("Supplier not found or inactive.");
            var ids = input.Lines.Select(x => x.MedicineId).Distinct().ToArray();
            if (await db.Medicines.CountAsync(x => ids.Contains(x.Id) && x.IsActive) != ids.Length) return Results.BadRequest("Medicine not found or inactive.");
            var invoice = input.SupplierInvoice.Trim();
            if (await db.Purchases.AnyAsync(x => x.SupplierId == input.SupplierId && x.SupplierInvoice == invoice))
                return Results.Conflict("Supplier invoice already received.");

            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var previousPurchases = await db.Purchases.Where(x => x.SupplierId == input.SupplierId)
                .SumAsync(x => (decimal?)x.Total) ?? 0m;
            var previousReturns = await db.PurchaseReturns.Where(x => x.Purchase.SupplierId == input.SupplierId)
                .SumAsync(x => (decimal?)x.Total) ?? 0m;
            var previousPayments = await db.SupplierPayments.Where(x => x.Purchase.SupplierId == input.SupplierId)
                .ToListAsync();
            var supplierCredit = Math.Max(0m, previousPayments
                .Where(x => !string.Equals(x.Method, "Supplier Credit", StringComparison.OrdinalIgnoreCase)).Sum(x => x.Amount)
                - previousPurchases + previousReturns);
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
            var supplierCreditApplied = Math.Min(purchase.Total, supplierCredit);
            if (paymentAmount > 0)
                db.SupplierPayments.Add(new SupplierPayment { PurchaseId = purchase.Id, Amount = paymentAmount,
                    Method = normalizedPaymentMethod!, Reference = input.PaymentReference?.Trim() });
            if (supplierCreditApplied > 0)
                db.SupplierPayments.Add(new SupplierPayment { PurchaseId = purchase.Id, Amount = supplierCreditApplied,
                    Method = "Supplier Credit", Reference = "Automatically applied from supplier credit" });
            foreach (var line in purchase.Lines)
                db.StockMovements.Add(new StockMovement { BatchId = line.BatchId, Type = "Purchase", ReferenceId = purchase.Id,
                    QuantityChange = line.Quantity, BalanceAfter = line.Quantity, Reason = $"Supplier invoice {purchase.SupplierInvoice}" });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created($"/api/purchases/{purchase.Id}", new { purchase.Id, purchase.Total,
                paymentAmount, paymentMethod = normalizedPaymentMethod, supplierCreditApplied });
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
                .Select(x => new { x.Purchase.SupplierId, x.Amount, x.Method }).ToListAsync();
            var purchaseTotals = purchases.GroupBy(x => x.SupplierId)
                .ToDictionary(x => x.Key, x => x.Sum(item => item.Total));
            var returnTotals = returns.GroupBy(x => x.SupplierId)
                .ToDictionary(x => x.Key, x => x.Sum(item => item.Total));
            var paidTotals = payments.Where(x => !string.Equals(x.Method, "Supplier Credit", StringComparison.OrdinalIgnoreCase))
                .GroupBy(x => x.SupplierId)
                .ToDictionary(x => x.Key, x => x.Sum(item => item.Amount));
            var invoiceCounts = purchases.GroupBy(x => x.SupplierId)
                .ToDictionary(x => x.Key, x => x.Count());

            return Results.Ok(suppliers.Select(supplier =>
            {
                var purchaseTotal = purchaseTotals.GetValueOrDefault(supplier.Id);
                var returnedTotal = returnTotals.GetValueOrDefault(supplier.Id);
                var externalPaid = paidTotals.GetValueOrDefault(supplier.Id);
                return new SupplierAccountSummary(supplier.Id, supplier.Name, invoiceCounts.GetValueOrDefault(supplier.Id),
                    purchaseTotal, returnedTotal, externalPaid, purchaseTotal - returnedTotal - externalPaid);
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
            var invoiceIds = invoices.Select(x => x.Id).ToArray();
            var corrections = await db.PurchaseCorrections.AsNoTracking().Where(x => invoiceIds.Contains(x.PurchaseId))
                .Include(x => x.Lines).ThenInclude(x => x.PurchaseLine).ThenInclude(x => x.Batch).ThenInclude(x => x.Medicine)
                .OrderByDescending(x => x.CreatedAt).ToListAsync();
            return Results.Ok(new
            {
                supplierId = supplier.Id, supplier = supplier.Name,
                invoices = invoices.Select(invoice => new
                {
                    invoice.Id, invoice.supplier, invoice.SupplierInvoice, invoice.CreatedAt, invoice.Total,
                    invoice.returnedTotal, invoice.paidTotal, invoice.lines, invoice.returns, invoice.payments,
                    corrections = corrections.Where(correction => correction.PurchaseId == invoice.Id).Select(correction => new
                    {
                        correction.Id, correction.Reason, correction.ActorId, correction.CreatedAt,
                        correction.PreviousTotal, correction.CorrectedTotal,
                        lines = correction.Lines.Select(line => new { line.PurchaseLineId,
                            medicine = line.PurchaseLine.Batch.Medicine.Name, batch = line.PurchaseLine.Batch.Number,
                            line.PreviousQuantity, line.CorrectedQuantity, line.QuantityChange })
                    })
                })
            });
        }).RequireAuthorization(StorePermissions.PurchasesRead);

        api.MapPost("/purchases/{id:long}/corrections", async (long id, PurchaseCorrectionRequest input, StoreDb db, ClaimsPrincipal principal) =>
        {
            var reason = input.Reason?.Trim();
            if (string.IsNullOrWhiteSpace(reason) || reason.Length > 300 || input.Lines is null || input.Lines.Count == 0 ||
                input.Lines.Any(x => x.CorrectedQuantity <= 0) || input.Lines.Select(x => x.PurchaseLineId).Distinct().Count() != input.Lines.Count)
                return Results.BadRequest("Enter a reason and a positive corrected quantity for each selected purchase line.");

            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var purchase = await db.Purchases.Include(x => x.Lines).ThenInclude(x => x.Batch).ThenInclude(x => x.Medicine)
                .SingleOrDefaultAsync(x => x.Id == id);
            if (purchase is null) return Results.NotFound();

            var byId = purchase.Lines.ToDictionary(x => x.Id);
            var changes = new List<(PurchaseLine Line, int CorrectedQuantity, int Delta)>();
            foreach (var requested in input.Lines)
            {
                if (!byId.TryGetValue(requested.PurchaseLineId, out var line))
                    return Results.BadRequest("A purchase line does not belong to this invoice.");
                if (requested.CorrectedQuantity < line.ReturnedQuantity)
                    return Results.Conflict("Corrected quantity cannot be less than the quantity already returned to the supplier.");
                var delta = requested.CorrectedQuantity - line.Quantity;
                if (delta < 0 && line.Batch.Quantity < -delta)
                    return Results.Conflict($"Cannot reduce {line.Batch.Medicine.Name} by {-delta}; only {line.Batch.Quantity} units remain in this batch. Some units may already have been sold or adjusted.");
                if (delta != 0) changes.Add((line, requested.CorrectedQuantity, delta));
            }
            if (changes.Count == 0) return Results.BadRequest("No purchase quantities have changed.");

            var previousTotal = purchase.Total;
            var correctedQuantities = changes.ToDictionary(x => x.Line.Id, x => x.CorrectedQuantity);
            var correctedTotal = decimal.Round(purchase.Lines.Sum(x => (decimal)correctedQuantities.GetValueOrDefault(x.Id, x.Quantity) * x.UnitCost), 2);
            var correction = new PurchaseCorrection { PurchaseId = id, Reason = reason, PreviousTotal = previousTotal,
                CorrectedTotal = correctedTotal, ActorId = principal.FindFirstValue(ClaimTypes.NameIdentifier) };
            foreach (var (line, correctedQuantity, delta) in changes)
            {
                var previousQuantity = line.Quantity;
                line.Quantity = correctedQuantity;
                line.Batch.Quantity += delta;
                correction.Lines.Add(new PurchaseCorrectionLine { PurchaseLineId = line.Id,
                    PreviousQuantity = previousQuantity, CorrectedQuantity = correctedQuantity, QuantityChange = delta });
                db.StockMovements.Add(new StockMovement { BatchId = line.BatchId, Type = "PurchaseCorrection", ReferenceId = id,
                    QuantityChange = delta, BalanceAfter = line.Batch.Quantity, Reason = reason,
                    ActorId = principal.FindFirstValue(ClaimTypes.NameIdentifier) });
            }
            purchase.Total = correctedTotal;
            db.PurchaseCorrections.Add(correction);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Ok(new { correction.Id, previousTotal, correctedTotal, quantityChanges = correction.Lines.Count });
        }).RequireAuthorization(StorePermissions.PurchasesManage);

        api.MapGet("/purchases/{id:long}/corrections", async (long id, StoreDb db) =>
        {
            if (!await db.Purchases.AnyAsync(x => x.Id == id)) return Results.NotFound();
            var corrections = await db.PurchaseCorrections.AsNoTracking().Where(x => x.PurchaseId == id)
                .Include(x => x.Lines).ThenInclude(x => x.PurchaseLine).ThenInclude(x => x.Batch).ThenInclude(x => x.Medicine)
                .OrderByDescending(x => x.CreatedAt).ToListAsync();
            return Results.Ok(corrections.Select(x => new
            {
                x.Id, x.Reason, x.ActorId, x.CreatedAt, x.PreviousTotal, x.CorrectedTotal,
                lines = x.Lines.Select(line => new { line.PurchaseLineId, medicine = line.PurchaseLine.Batch.Medicine.Name,
                    batch = line.PurchaseLine.Batch.Number, line.PreviousQuantity, line.CorrectedQuantity, line.QuantityChange })
            }));
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
            var outstanding = Math.Max(0m, purchase.Total - purchase.Returns.Sum(x => x.Total) - purchase.Payments.Sum(x => x.Amount));
            var payment = new SupplierPayment { PurchaseId = id, Amount = amount, Method = method,
                Reference = input.Reference?.Trim() };
            db.SupplierPayments.Add(payment);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created($"/api/purchases/{id}/payments/{payment.Id}", new { payment.Id, payment.Amount, payment.Method,
                supplierCreditAdded = Math.Max(0m, amount - outstanding) });
        }).RequireAuthorization(StorePermissions.PurchasesManage);
    }
}

public sealed record SupplierAccountSummary(long SupplierId, string Supplier, int InvoiceCount,
    decimal PurchaseTotal, decimal ReturnedTotal, decimal PaidTotal, decimal Balance);

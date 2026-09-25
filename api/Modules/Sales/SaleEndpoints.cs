using MedicalStore.Api.Modules.Inventory;
using MedicalStore.Api.Modules.Authentication;
using MedicalStore.Api.Infrastructure.Persistence;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MedicalStore.Api.Modules.Customers;

namespace MedicalStore.Api.Modules.Sales;

public static class SaleEndpoints
{
    public static void MapSaleEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/sales/customers", async (StoreDb db) => Results.Ok(await db.Customers.AsNoTracking()
            .Where(x => x.IsActive).OrderBy(x => x.Name).Select(x => new { x.Id, x.Name }).ToListAsync()))
            .RequireAuthorization(StorePermissions.SalesCreate);

        api.MapPost("/sales", async (SaleRequest input, StoreDb db, ClaimsPrincipal principal) =>
        {
            var method = input.PaymentMethod?.Trim();
            var isNotReceived = string.Equals(method, "Not Received", StringComparison.OrdinalIgnoreCase);
            var paymentMethods = new[] { "Cash", "Card", "Bank Transfer", "Mobile Wallet", "Not Received" };
            if (input.Lines is null || input.Lines.Count == 0 || input.Lines.Any(x => x.Quantity <= 0) ||
                input.CashReceived < 0 || input.DiscountAmount < 0 || method is null ||
                !paymentMethods.Contains(method, StringComparer.OrdinalIgnoreCase))
                return Results.BadRequest("Select items, enter positive quantities and valid discount, tender and payment method.");
            method = paymentMethods.Single(x => string.Equals(x, method, StringComparison.OrdinalIgnoreCase));
            var wanted = input.Lines.GroupBy(x => x.MedicineId).Select(x => new SaleRequestLine(x.Key, x.Sum(y => y.Quantity))).ToArray();
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var ids = wanted.Select(x => x.MedicineId).ToArray();
            var medicines = await db.Medicines.Where(x => ids.Contains(x.Id)).ToListAsync();
            if (medicines.Count != ids.Length || medicines.Any(x => !x.IsActive || x.RequiresPrescription))
                return Results.BadRequest("Medicine is unavailable or requires a prescription workflow.");
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var batches = await db.Batches.Where(x => ids.Contains(x.MedicineId) && x.ExpiryDate >= today && x.Quantity > 0)
                .OrderBy(x => x.ExpiryDate).ThenBy(x => x.Id).ToListAsync();
            var isCash = string.Equals(method, "Cash", StringComparison.OrdinalIgnoreCase);
            Customer? customer = null;
            if (isNotReceived && input.CustomerId is null) return Results.BadRequest("Choose a customer when payment has not been received.");
            if (input.CustomerId is not null)
            {
                customer = await db.Customers.SingleOrDefaultAsync(x => x.Id == input.CustomerId && x.IsActive);
                if (customer is null) return Results.BadRequest("Customer is unavailable in this store.");
            }
            var sale = new Sale { InvoiceNumber = $"TMP-{Guid.NewGuid():N}", CashReceived = isCash ? input.CashReceived : 0, PaymentMethod = method,
                CustomerId = customer?.Id,
                CashierId = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                    ?? principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "" };
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
            sale.Subtotal = decimal.Round(sale.Lines.Sum(x => x.UnitPrice * x.Quantity), 2);
            sale.DiscountAmount = decimal.Round(input.DiscountAmount, 2);
            if (sale.DiscountAmount > sale.Subtotal) return Results.BadRequest("Discount cannot exceed the sale subtotal.");
            sale.Total = sale.Subtotal - sale.DiscountAmount;
            if (isCash && input.CashReceived < sale.Total)
                return Results.BadRequest($"Cash received must be at least {sale.Total:0.00}.");
            var distributedDiscount = 0m;
            for (var i = 0; i < sale.Lines.Count; i++)
            {
                var line = sale.Lines[i];
                var lineGross = line.UnitPrice * line.Quantity;
                line.DiscountAmount = i == sale.Lines.Count - 1
                    ? sale.DiscountAmount - distributedDiscount
                    : sale.Subtotal == 0 ? 0 : decimal.Round(sale.DiscountAmount * lineGross / sale.Subtotal, 2);
                distributedDiscount += line.DiscountAmount;
            }
            db.Sales.Add(sale);
            await db.SaveChangesAsync();
            sale.InvoiceNumber = $"INV-{sale.Id:D8}";
            foreach (var (batch, taken) in movements)
                db.StockMovements.Add(new StockMovement { BatchId = batch.Id, Type = "Sale", ReferenceId = sale.Id,
                    QuantityChange = -taken, BalanceAfter = batch.Quantity, Reason = sale.InvoiceNumber, ActorId = sale.CashierId });
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created($"/api/sales/{sale.Id}", new { sale.Id, sale.InvoiceNumber, sale.Subtotal, sale.DiscountAmount,
                sale.Total, sale.PaymentMethod, sale.CustomerId, change = isCash ? sale.CashReceived - sale.Total : 0 });
        }).RequireAuthorization(StorePermissions.SalesCreate);

        api.MapGet("/sales", async (StoreDb db) => Results.Ok(await db.Sales.AsNoTracking().OrderByDescending(x => x.Id)
            .Take(100).Select(x => new { x.Id, x.InvoiceNumber, x.CreatedAt, x.Subtotal, x.DiscountAmount, x.Total,
                x.PaymentMethod, returnedTotal = x.Returns.Sum(r => (decimal?)r.TotalRefund) ?? 0 }).ToListAsync()))
            .RequireAuthorization(StorePermissions.SalesRead);

        api.MapGet("/sales/{id:long}", async (long id, StoreDb db) =>
        {
            var sale = await db.Sales.Where(x => x.Id == id).Select(x => new
            {
                x.Id, x.InvoiceNumber, x.CreatedAt, x.Subtotal, x.DiscountAmount, x.Total, x.CashReceived, x.PaymentMethod,
                customer = x.CustomerId == null ? null : db.Customers.Where(c => c.Id == x.CustomerId).Select(c => c.Name).FirstOrDefault(),
                returnedTotal = x.Returns.Sum(r => (decimal?)r.TotalRefund) ?? 0,
                lines = x.Lines.Select(y => new { saleLineId = y.Id, medicine = y.Batch.Medicine.Name, batch = y.Batch.Number,
                    quantity = y.Quantity, returnedQuantity = y.ReturnedQuantity, y.UnitPrice, y.DiscountAmount,
                    total = y.UnitPrice * y.Quantity - y.DiscountAmount })
            }).SingleOrDefaultAsync();
            return sale is null ? Results.NotFound() : Results.Ok(sale);
        }).RequireAuthorization(StorePermissions.SalesRead);

        api.MapPost("/sales/{id:long}/returns", async (long id, SaleReturnRequest input, StoreDb db, ClaimsPrincipal principal) =>
        {
            var refundMethod = input.RefundMethod?.Trim();
            var paymentMethods = new[] { "Cash", "Card", "Bank Transfer", "Mobile Wallet" };
            if (string.IsNullOrWhiteSpace(input.Reason) || input.Lines is null || input.Lines.Count == 0 ||
                input.Lines.Any(x => x.Quantity <= 0) || refundMethod is null ||
                !paymentMethods.Contains(refundMethod, StringComparer.OrdinalIgnoreCase))
                return Results.BadRequest("Return reason, positive quantities and a supported refund method are required.");
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var sale = await db.Sales.Include(x => x.Lines).ThenInclude(x => x.Batch)
                .SingleOrDefaultAsync(x => x.Id == id);
            if (sale is null) return Results.NotFound();
            var requested = input.Lines.GroupBy(x => new { x.SaleLineId, x.Restock })
                .Select(g => new { g.Key.SaleLineId, g.Key.Restock, Quantity = g.Sum(x => x.Quantity) }).ToArray();
            var byId = sale.Lines.ToDictionary(x => x.Id);
            foreach (var request in requested)
            {
                if (!byId.TryGetValue(request.SaleLineId, out var line)) return Results.BadRequest("Sale line does not belong to this invoice.");
                if (request.Quantity > line.Quantity - line.ReturnedQuantity)
                    return Results.Conflict("Return quantity exceeds the unreturned quantity sold.");
                if (request.Restock && line.Batch.ExpiryDate < DateOnly.FromDateTime(DateTime.UtcNow))
                    return Results.Conflict("Expired stock cannot be returned to saleable inventory.");
            }
            var saleReturn = new SaleReturn { SaleId = id, Reason = input.Reason.Trim(), RefundMethod = refundMethod };
            foreach (var request in requested)
            {
                var line = byId[request.SaleLineId];
                line.ReturnedQuantity += request.Quantity;
                var unitRefund = Math.Max(0m, line.UnitPrice - line.DiscountAmount / line.Quantity);
                saleReturn.Lines.Add(new SaleReturnLine { SaleLineId = line.Id, BatchId = line.BatchId,
                    Quantity = request.Quantity, Restocked = request.Restock, UnitRefund = unitRefund });
                if (request.Restock)
                {
                    line.Batch.Quantity += request.Quantity;
                    db.StockMovements.Add(new StockMovement { BatchId = line.BatchId, Type = "SaleReturn", ReferenceId = id,
                        QuantityChange = request.Quantity, BalanceAfter = line.Batch.Quantity, Reason = input.Reason.Trim(),
                        ActorId = principal.FindFirstValue(ClaimTypes.NameIdentifier) });
                }
                else
                {
                    db.StockMovements.Add(new StockMovement { BatchId = line.BatchId, Type = "DamagedReturn", ReferenceId = id,
                        QuantityChange = 0, BalanceAfter = line.Batch.Quantity, Reason = input.Reason.Trim(),
                        ActorId = principal.FindFirstValue(ClaimTypes.NameIdentifier) });
                }
            }
            saleReturn.TotalRefund = decimal.Round(saleReturn.Lines.Sum(x => x.Quantity * x.UnitRefund), 2);
            db.SaleReturns.Add(saleReturn);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created($"/api/sales/{id}/returns/{saleReturn.Id}", new { saleReturn.Id, saleReturn.TotalRefund, saleReturn.RefundMethod });
        }).RequireAuthorization(StorePermissions.SalesManage);
    }
}

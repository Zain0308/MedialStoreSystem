using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Authentication;
using Microsoft.EntityFrameworkCore;
using System.Text;

namespace MedicalStore.Api.Modules.Reports;

public static class ReportEndpoints
{
    public static void MapReportEndpoints(this RouteGroupBuilder api)
    {
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
        }).RequireAuthorization(StorePermissions.ReportsRead);

        api.MapGet("/reports/details", async (DateOnly? from, DateOnly? to, StoreDb db) =>
        {
            if (from.HasValue && to.HasValue && from > to) return Results.BadRequest("From date must be on or before To date.");
            var report = await BuildReport(db, from, to);
            return Results.Ok(report);
        }).RequireAuthorization(StorePermissions.ReportsRead);

        api.MapGet("/reports/export", async (string type, DateOnly? from, DateOnly? to, StoreDb db) =>
        {
            if (from.HasValue && to.HasValue && from > to) return Results.BadRequest("From date must be on or before To date.");
            var report = await BuildReport(db, from, to);
            var csv = new StringBuilder();
            switch (type.ToLowerInvariant())
            {
                case "sales":
                    csv.AppendLine("Invoice,Date,Customer,Payment Method,Subtotal,Discount,Total,Returned,Net Sales,Cost,Profit");
                    foreach (var sale in report.Sales)
                        csv.AppendLine(Row(sale.InvoiceNumber, sale.CreatedAt.ToString("O"), sale.Customer ?? "Walk-in", sale.PaymentMethod,
                            sale.Subtotal, sale.DiscountAmount, sale.Total, sale.Returned, sale.NetSales, sale.Cost, sale.NetSales - sale.Cost));
                    break;
                case "inventory":
                    csv.AppendLine("Medicine,Batch,Expiry,Quantity,Cost Price,Sale Price,Cost Value,Sale Value");
                    foreach (var item in report.Inventory)
                        csv.AppendLine(Row(item.Medicine, item.Batch, item.ExpiryDate, item.Quantity, item.CostPrice, item.SalePrice, item.CostValue, item.SaleValue));
                    break;
                case "expenses":
                    csv.AppendLine("Date,Category,Description,Payment Method,Reference,Amount");
                    foreach (var expense in report.Expenses)
                        csv.AppendLine(Row(expense.ExpenseDate, expense.Category, expense.Description, expense.PaymentMethod, expense.Reference ?? "", expense.Amount));
                    break;
                case "profit":
                    csv.AppendLine("From,To,Net Sales,Cost of Goods,Expenses,Net Profit");
                    csv.AppendLine(Row(report.From ?? "", report.To ?? "", report.NetSales, report.CostOfGoods, report.ExpenseTotal, report.NetProfit));
                    break;
                default: return Results.BadRequest("Choose sales, inventory, expenses or profit export.");
            }
            var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray();
            return Results.File(bytes, "text/csv; charset=utf-8", $"{type.ToLowerInvariant()}-report.csv");
        }).RequireAuthorization(StorePermissions.ReportsRead);
    }

    private static async Task<DetailedReport> BuildReport(StoreDb db, DateOnly? from, DateOnly? to)
    {
        var salesQuery = db.Sales.AsNoTracking().AsQueryable();
        if (from.HasValue) salesQuery = salesQuery.Where(x => x.CreatedAt >= new DateTimeOffset(from.Value.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero));
        if (to.HasValue) salesQuery = salesQuery.Where(x => x.CreatedAt < new DateTimeOffset(to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero));
        var salesData = await salesQuery.OrderByDescending(x => x.CreatedAt).Select(x => new SaleReportRow(
            x.InvoiceNumber, x.CreatedAt, x.CustomerId == null ? null : db.Customers.Where(c => c.Id == x.CustomerId).Select(c => c.Name).FirstOrDefault(),
            x.PaymentMethod, x.Subtotal, x.DiscountAmount, x.Total,
            x.Returns.Sum(r => (decimal?)r.TotalRefund) ?? 0,
            x.Lines.Sum(l => l.UnitCost * l.Quantity) - (db.SaleReturnLines.Where(r => r.SaleLine.SaleId == x.Id && r.Restocked)
                .Sum(r => (decimal?)(r.Quantity * r.SaleLine.UnitCost)) ?? 0),
            x.Lines.Sum(l => l.UnitPrice * l.Quantity - l.DiscountAmount) - (x.Returns.Sum(r => (decimal?)r.TotalRefund) ?? 0)
        )).ToListAsync();
        var inventory = await db.Batches.AsNoTracking().Where(x => x.Quantity > 0)
            .OrderBy(x => x.Medicine.Name).ThenBy(x => x.ExpiryDate)
            .Select(x => new InventoryReportRow(x.Medicine.Name, x.Number, x.ExpiryDate, x.Quantity, x.CostPrice, x.SalePrice,
                x.CostPrice * x.Quantity, x.SalePrice * x.Quantity)).ToListAsync();
        var expensesQuery = db.Expenses.AsNoTracking().AsQueryable();
        if (from.HasValue) expensesQuery = expensesQuery.Where(x => x.ExpenseDate >= from.Value);
        if (to.HasValue) expensesQuery = expensesQuery.Where(x => x.ExpenseDate <= to.Value);
        var expenses = await expensesQuery.OrderByDescending(x => x.ExpenseDate).Select(x => new ExpenseReportRow(
            x.ExpenseDate, db.ExpenseCategories.Where(c => c.Id == x.CategoryId).Select(c => c.Name).FirstOrDefault() ?? "Uncategorized",
            x.Description, x.PaymentMethod, x.Reference, x.Amount)).ToListAsync();
        var netSales = salesData.Sum(x => x.NetSales);
        var cogs = salesData.Sum(x => x.Cost);
        var expenseTotal = expenses.Sum(x => x.Amount);
        return new DetailedReport(from?.ToString("yyyy-MM-dd"), to?.ToString("yyyy-MM-dd"), salesData, inventory, expenses,
            netSales, cogs, expenseTotal, netSales - cogs - expenseTotal,
            salesData.Sum(x => x.Returned), inventory.Sum(x => x.CostValue), inventory.Sum(x => x.SaleValue));
    }

    private static string Row(params object?[] values) => string.Join(",", values.Select(value => Csv(value?.ToString() ?? "")));
    private static string Csv(string value) => $"\"{value.Replace("\"", "\"\"")}\"";

    private sealed record SaleReportRow(string InvoiceNumber, DateTimeOffset CreatedAt, string? Customer, string PaymentMethod,
        decimal Subtotal, decimal DiscountAmount, decimal Total, decimal Returned, decimal Cost, decimal NetSales);
    private sealed record InventoryReportRow(string Medicine, string Batch, DateOnly ExpiryDate, int Quantity,
        decimal CostPrice, decimal SalePrice, decimal CostValue, decimal SaleValue);
    private sealed record ExpenseReportRow(DateOnly ExpenseDate, string Category, string Description,
        string PaymentMethod, string? Reference, decimal Amount);
    private sealed record DetailedReport(string? From, string? To, List<SaleReportRow> Sales, List<InventoryReportRow> Inventory,
        List<ExpenseReportRow> Expenses, decimal NetSales, decimal CostOfGoods, decimal ExpenseTotal, decimal NetProfit,
        decimal ReturnedTotal, decimal InventoryCostValue, decimal InventorySaleValue);
}

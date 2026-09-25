using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Authentication;
using Microsoft.EntityFrameworkCore;

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
    }
}

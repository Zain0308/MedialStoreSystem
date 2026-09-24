using MedicalStore.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace MedicalStore.Api.Modules.Inventory;

public static class InventoryEndpoints
{
    public static void MapInventoryEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/inventory", async (StoreDb db) => Results.Ok(await db.Batches
            .OrderBy(x => x.ExpiryDate).Select(x => new { x.Id, medicineId = x.MedicineId, medicine = x.Medicine.Name,
                x.Number, x.ExpiryDate, x.CostPrice, x.SalePrice, x.Quantity }).ToListAsync()));
    }
}

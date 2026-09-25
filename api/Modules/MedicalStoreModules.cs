using MedicalStore.Api.Modules.Authentication;
using MedicalStore.Api.Modules.Medicines;
using MedicalStore.Api.Modules.Inventory;
using MedicalStore.Api.Modules.Purchases;
using MedicalStore.Api.Modules.Sales;
using MedicalStore.Api.Modules.Suppliers;
using MedicalStore.Api.Modules.Reports;
using MedicalStore.Api.Modules.Stores;

namespace MedicalStore.Api.Modules;

public static class MedicalStoreModules
{
    public static void MapMedicalStoreModules(this WebApplication app, string jwtKey, string ownerEmail)
    {
        app.MapAuthenticationEndpoints(jwtKey, ownerEmail);
        var api = app.MapGroup("/api").RequireAuthorization();
        api.MapMedicineEndpoints();
        api.MapInventoryEndpoints();
        api.MapPurchaseEndpoints();
        api.MapSaleEndpoints();
        api.MapSupplierEndpoints();
        api.MapReportEndpoints();
        api.MapStoreEndpoints();
    }
}


using MedicalStore.Api.Modules.Authentication;
using MedicalStore.Api.Modules.Medicines;
using MedicalStore.Api.Modules.Inventory;
using MedicalStore.Api.Modules.Purchases;
using MedicalStore.Api.Modules.Sales;
using MedicalStore.Api.Modules.Suppliers;
using MedicalStore.Api.Modules.Reports;
using MedicalStore.Api.Modules.Stores;
using MedicalStore.Api.Modules.Customers;
using MedicalStore.Api.Modules.Expenses;

namespace MedicalStore.Api.Modules;

public static class MedicalStoreModules
{
    public static void MapMedicalStoreModules(this WebApplication app, string jwtKey, string ownerEmail)
    {
        app.MapAuthenticationEndpoints(jwtKey, ownerEmail);
        var api = app.MapGroup("/api").RequireAuthorization();
        api.AddEndpointFilter(async (context, next) =>
        {
            var currentStore = context.HttpContext.RequestServices.GetRequiredService<MedicalStore.Api.Infrastructure.Persistence.CurrentStoreContext>();
            var request = context.HttpContext.Request;
            if (currentStore.SubscriptionExpired &&
                !(HttpMethods.IsGet(request.Method) && request.Path.Equals("/api/dashboard", StringComparison.OrdinalIgnoreCase)))
                return Results.Problem("This store's subscription has expired. Only the dashboard is available.", statusCode: 403);
            return await next(context);
        });
        api.MapMedicineEndpoints();
        api.MapInventoryEndpoints();
        api.MapPurchaseEndpoints();
        api.MapSaleEndpoints();
        api.MapSupplierEndpoints();
        api.MapReportEndpoints();
        api.MapCustomerEndpoints();
        api.MapExpenseEndpoints();
        api.MapStoreEndpoints();
    }
}

using Microsoft.EntityFrameworkCore;
using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Authentication;

namespace MedicalStore.Api.Modules.Medicines;

public static class MedicineEndpoints
{
    public static void MapMedicineEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/medicines", async (StoreDb db) =>
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            return Results.Ok(await db.Medicines.OrderBy(x => x.Name).Select(x => new
            {
                x.Id, x.Name, x.GenericName, x.Barcode, x.Strength, x.DosageForm, x.Manufacturer, x.Description,
                x.RequiresPrescription, x.MinimumStock, x.IsActive,
                stock = x.Batches.Where(b => b.ExpiryDate > today).Sum(b => b.Quantity)
            }).ToListAsync());
        }).RequireAuthorization(StorePermissions.MedicinesRead);

        api.MapPost("/medicines", async (MedicineRequest input, StoreDb db) =>
        {
            if (!IsValid(input)) return Results.BadRequest("Medicine name and metadata must fit the allowed lengths, and minimum stock cannot be negative.");
            var barcode = string.IsNullOrWhiteSpace(input.Barcode) ? null : input.Barcode.Trim();
            if (barcode is not null && await db.Medicines.AnyAsync(x => x.Barcode == barcode)) return Results.Conflict("Barcode already exists.");
            var name = input.Name.Trim();
            var genericName = Clean(input.GenericName);
            var strength = Clean(input.Strength);
            var dosageForm = Clean(input.DosageForm);
            var manufacturer = Clean(input.Manufacturer);
            if (await HasMatchingMedicineAsync(db, name, genericName, strength, dosageForm))
                return Results.Conflict("A medicine with this name, generic name, strength and dosage form already exists in this store. Select the existing medicine for the purchase.");
            var medicine = new Medicine { Name = input.Name.Trim(), GenericName = genericName, Barcode = barcode,
                Strength = strength, DosageForm = dosageForm, Manufacturer = manufacturer,
                Description = input.Description?.Trim(), MinimumStock = input.MinimumStock, RequiresPrescription = input.RequiresPrescription };
            db.Medicines.Add(medicine);
            await db.SaveChangesAsync();
            return Results.Created($"/api/medicines/{medicine.Id}", new { medicine.Id });
        }).RequireAuthorization(StorePermissions.MedicinesManage);

        api.MapPut("/medicines/{id:long}", async (long id, MedicineRequest input, StoreDb db) =>
        {
            if (!IsValid(input))
                return Results.BadRequest("Medicine name and metadata must fit the allowed lengths, and minimum stock cannot be negative.");
            var medicine = await db.Medicines.SingleOrDefaultAsync(x => x.Id == id);
            if (medicine is null) return Results.NotFound();
            var barcode = string.IsNullOrWhiteSpace(input.Barcode) ? null : input.Barcode.Trim();
            if (barcode is not null && await db.Medicines.AnyAsync(x => x.Id != id && x.Barcode == barcode))
                return Results.Conflict("Barcode already exists.");
            var name = input.Name.Trim();
            var genericName = Clean(input.GenericName);
            var strength = Clean(input.Strength);
            var dosageForm = Clean(input.DosageForm);
            var manufacturer = Clean(input.Manufacturer);
            if (await HasMatchingMedicineAsync(db, name, genericName, strength, dosageForm, id))
                return Results.Conflict("A medicine with this name, generic name, strength and dosage form already exists in this store.");
            medicine.Name = input.Name.Trim(); medicine.GenericName = genericName; medicine.Barcode = barcode;
            medicine.Strength = strength; medicine.DosageForm = dosageForm;
            medicine.Manufacturer = manufacturer; medicine.Description = Clean(input.Description);
            medicine.MinimumStock = input.MinimumStock; medicine.RequiresPrescription = input.RequiresPrescription;
            await db.SaveChangesAsync();
            return Results.Ok(new { medicine.Id });
        }).RequireAuthorization(StorePermissions.MedicinesManage);

        api.MapPut("/medicines/{id:long}/status", async (long id, MedicineStatusRequest input, StoreDb db) =>
        {
            var medicine = await db.Medicines.SingleOrDefaultAsync(x => x.Id == id);
            if (medicine is null) return Results.NotFound();
            medicine.IsActive = input.IsActive;
            await db.SaveChangesAsync();
            return Results.Ok(new { medicine.Id, medicine.IsActive });
        }).RequireAuthorization(StorePermissions.MedicinesManage);
    }

    private static bool IsValid(MedicineRequest input) =>
        !string.IsNullOrWhiteSpace(input.Name) && input.Name.Trim().Length <= 200 && input.MinimumStock >= 0 &&
        (input.GenericName?.Length ?? 0) <= 200 && (input.Barcode?.Length ?? 0) <= 100 &&
        (input.Strength?.Length ?? 0) <= 80 && (input.DosageForm?.Length ?? 0) <= 80 &&
        (input.Manufacturer?.Length ?? 0) <= 160 && (input.Description?.Length ?? 0) <= 1000;

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static Task<bool> HasMatchingMedicineAsync(StoreDb db, string name, string? genericName, string? strength,
        string? dosageForm, long? excludeId = null)
    {
        var normalizedName = name.ToUpperInvariant();
        var normalizedGenericName = (genericName ?? string.Empty).ToUpperInvariant();
        var normalizedStrength = (strength ?? string.Empty).ToUpperInvariant();
        var normalizedDosageForm = (dosageForm ?? string.Empty).ToUpperInvariant();
        return db.Medicines.AnyAsync(x => (!excludeId.HasValue || x.Id != excludeId.Value) &&
            x.Name.Trim().ToUpper() == normalizedName &&
            (x.GenericName ?? string.Empty).Trim().ToUpper() == normalizedGenericName &&
            (x.Strength ?? string.Empty).Trim().ToUpper() == normalizedStrength &&
            (x.DosageForm ?? string.Empty).Trim().ToUpper() == normalizedDosageForm);
    }
}

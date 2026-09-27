using System.Globalization;
using System.Security.Claims;
using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Authentication;
using MedicalStore.Api.Modules.Inventory;
using MedicalStore.Api.Modules.Medicines;
using MedicalStore.Api.Modules.Suppliers;
using Microsoft.EntityFrameworkCore;

namespace MedicalStore.Api.Modules.Imports;

public static class DataImportEndpoints
{
    private const int MaximumRows = 5000;
    private static readonly string[] RequiredPermissions =
        [StorePermissions.MedicinesManage, StorePermissions.SuppliersManage, StorePermissions.InventoryManage];

    public static void MapDataImportEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/imports/template", () => Results.File(
            System.Text.Encoding.UTF8.GetPreamble().Concat(System.Text.Encoding.UTF8.GetBytes(ImportSpreadsheetReader.TemplateCsv)).ToArray(),
            "text/csv; charset=utf-8", "medical-store-import-template.csv"))
            .RequireAuthorization(RequiredPermissions);

        api.MapPost("/imports/preview", async (ImportFileRequest input, StoreDb db) =>
        {
            try
            {
                var rows = ImportSpreadsheetReader.Read(input.FileName, input.FileContentBase64);
                if (rows.Count > MaximumRows) return Results.BadRequest($"Import up to {MaximumRows} rows at a time.");
                if (rows.Count == 0) return Results.BadRequest("The file has no data rows.");
                var checkedRows = await ValidateRowsAsync(rows, db);
                return Results.Ok(Summarize(checkedRows));
            }
            catch (InvalidDataException exception) { return Results.BadRequest(exception.Message); }
        }).RequireAuthorization(RequiredPermissions);

        api.MapPost("/imports/commit", async (ImportFileRequest input, StoreDb db, ClaimsPrincipal principal) =>
        {
            try
            {
                var rows = ImportSpreadsheetReader.Read(input.FileName, input.FileContentBase64);
                if (rows.Count > MaximumRows) return Results.BadRequest($"Import up to {MaximumRows} rows at a time.");
                if (rows.Count == 0) return Results.BadRequest("The file has no data rows.");
                await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
                var checkedRows = await ValidateRowsAsync(rows, db);
                if (checkedRows.Any(row => row.Errors.Count > 0))
                    return Results.Conflict(Summarize(checkedRows));

                var medicines = (await db.Medicines.ToListAsync()).GroupBy(MedicineKey)
                    .ToDictionary(group => group.Key, group => group.First());
                var suppliers = (await db.Suppliers.ToListAsync()).GroupBy(x => Key(x.Name))
                    .ToDictionary(group => group.Key, group => group.First());
                var createdMedicines = 0;
                var createdSuppliers = 0;
                foreach (var row in checkedRows)
                {
                    if (!string.IsNullOrWhiteSpace(row.Source.MedicineName) && !medicines.ContainsKey(row.MedicineKey))
                    {
                        var medicine = new Medicine { Name = row.Source.MedicineName.Trim(),
                            GenericName = Clean(row.Source.GenericName), Strength = Clean(row.Source.Strength),
                            DosageForm = Clean(row.Source.DosageForm), Manufacturer = Clean(row.Source.Manufacturer),
                            Barcode = Clean(row.Source.Barcode), MinimumStock = row.MinimumStock,
                            RequiresPrescription = row.RequiresPrescription };
                        db.Medicines.Add(medicine); medicines[row.MedicineKey] = medicine; createdMedicines++;
                    }
                    if (!string.IsNullOrWhiteSpace(row.Source.SupplierName) && !suppliers.ContainsKey(Key(row.Source.SupplierName)))
                    {
                        var supplier = new Supplier { Name = row.Source.SupplierName.Trim(),
                            ContactPerson = Clean(row.Source.ContactPerson), Phone = Clean(row.Source.Phone),
                            Email = Clean(row.Source.Email), Address = Clean(row.Source.Address) };
                        db.Suppliers.Add(supplier); suppliers[Key(row.Source.SupplierName)] = supplier; createdSuppliers++;
                    }
                }
                await db.SaveChangesAsync();

                var existingBatches = await db.Batches.ToListAsync();
                var openingLines = checkedRows.Where(row => row.OpeningQuantity > 0).ToList();
                var unitsAdded = 0;
                foreach (var row in openingLines)
                {
                    var medicine = medicines[row.MedicineKey];
                    var batch = existingBatches.FirstOrDefault(item => item.MedicineId == medicine.Id &&
                        Key(item.Number) == Key(row.Source.BatchNumber) && item.ExpiryDate == row.ExpiryDate);
                    if (batch is null)
                    {
                        batch = new Batch { Medicine = medicine, Number = row.Source.BatchNumber.Trim(),
                            ExpiryDate = row.ExpiryDate!.Value, CostPrice = row.UnitCost, SalePrice = row.SalePrice,
                            Quantity = row.OpeningQuantity };
                        db.Batches.Add(batch); existingBatches.Add(batch);
                    }
                    else
                    {
                        batch.Quantity += row.OpeningQuantity;
                    }
                    unitsAdded += row.OpeningQuantity;
                }
                await db.SaveChangesAsync();

                foreach (var row in openingLines)
                {
                    var medicine = medicines[row.MedicineKey];
                    var batch = existingBatches.First(item => item.MedicineId == medicine.Id &&
                        Key(item.Number) == Key(row.Source.BatchNumber) && item.ExpiryDate == row.ExpiryDate);
                    db.StockMovements.Add(new StockMovement { BatchId = batch.Id, Type = "OpeningStock",
                        QuantityChange = row.OpeningQuantity, BalanceAfter = batch.Quantity,
                        Reason = $"Opening stock import, spreadsheet row {row.Source.RowNumber}",
                        ActorId = principal.FindFirstValue(ClaimTypes.NameIdentifier) });
                }
                await db.SaveChangesAsync();
                await transaction.CommitAsync();
                return Results.Ok(new { createdMedicines, createdSuppliers, openingBatches = openingLines.Count, unitsAdded });
            }
            catch (InvalidDataException exception) { return Results.BadRequest(exception.Message); }
        }).RequireAuthorization(RequiredPermissions);
    }

    private static async Task<List<CheckedImportRow>> ValidateRowsAsync(IReadOnlyList<ImportSheetRow> rows, StoreDb db)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var medicines = await db.Medicines.AsNoTracking().ToListAsync();
        var suppliers = await db.Suppliers.AsNoTracking().ToListAsync();
        var batches = await db.Batches.AsNoTracking().ToListAsync();
        var medicineByKey = medicines.GroupBy(MedicineKey).ToDictionary(group => group.Key, group => group.First());
        var supplierNames = suppliers.Select(supplier => Key(supplier.Name)).ToHashSet();
        var fileMedicineKeys = new HashSet<string>();
        var fileSupplierKeys = new HashSet<string>();
        var fileBarcodes = new Dictionary<string, string>();
        var fileBatches = new HashSet<string>();
        var result = new List<CheckedImportRow>(rows.Count);

        foreach (var source in rows)
        {
            var errors = new List<string>(); var warnings = new List<string>();
            var medicineKey = string.IsNullOrWhiteSpace(source.MedicineName) ? "" : MedicineKey(source.MedicineName,
                source.GenericName, source.Strength, source.DosageForm);
            var hasMedicine = !string.IsNullOrWhiteSpace(source.MedicineName);
            var hasSupplier = !string.IsNullOrWhiteSpace(source.SupplierName);
            if (!hasMedicine && !hasSupplier) errors.Add("Enter a medicine name or supplier name.");
            if (!hasMedicine && !string.IsNullOrWhiteSpace(source.Barcode)) errors.Add("A barcode needs a medicine name.");
            if (source.MedicineName.Length > 200 || source.GenericName.Length > 200 || source.Strength.Length > 80 ||
                source.DosageForm.Length > 80 || source.Manufacturer.Length > 160 || source.Barcode.Length > 100)
                errors.Add("Medicine details exceed the allowed field length.");
            var minimumStock = 0;
            if (!string.IsNullOrWhiteSpace(source.MinimumStock) &&
                (!int.TryParse(source.MinimumStock, NumberStyles.Integer, CultureInfo.InvariantCulture, out minimumStock) || minimumStock < 0))
                errors.Add("MinimumStock must be a whole number zero or greater.");
            var requiresPrescription = false;
            if (!string.IsNullOrWhiteSpace(source.RequiresPrescription) && !TryBoolean(source.RequiresPrescription, out requiresPrescription))
                errors.Add("RequiresPrescription must be true/false or yes/no.");

            if (hasSupplier && source.SupplierName.Length > 200) errors.Add("Supplier name cannot exceed 200 characters.");
            if ((source.ContactPerson.Length > 120) || source.Phone.Length > 40 || source.Email.Length > 254 || source.Address.Length > 300)
                errors.Add("Supplier contact details exceed the allowed field length.");
            if (!hasSupplier && new[] { source.ContactPerson, source.Phone, source.Email, source.Address }.Any(value => !string.IsNullOrWhiteSpace(value)))
                errors.Add("Enter a supplier name for the supplier contact details.");

            var existingMedicine = hasMedicine ? medicineByKey.GetValueOrDefault(medicineKey) : null;
            if (existingMedicine is { IsActive: false }) errors.Add("This matching medicine is inactive. Activate it before importing stock.");
            if (hasMedicine && !string.IsNullOrWhiteSpace(source.Barcode))
            {
                var barcode = Key(source.Barcode);
                var existingBarcode = medicines.FirstOrDefault(item => Key(item.Barcode ?? "") == barcode);
                if (existingBarcode is not null && MedicineKey(existingBarcode) != medicineKey)
                    errors.Add("This barcode already belongs to a different medicine.");
                if (fileBarcodes.TryGetValue(barcode, out var barcodeMedicine) && barcodeMedicine != medicineKey)
                    errors.Add("This barcode is assigned to more than one medicine in the file.");
                else fileBarcodes[barcode] = medicineKey;
            }
            var medicineWasSeen = hasMedicine && !fileMedicineKeys.Add(medicineKey);
            if (hasMedicine && existingMedicine is not null)
                warnings.Add($"Matching medicine already exists; its catalogue record will be reused.");
            else if (medicineWasSeen)
                warnings.Add("This medicine appears on another row; one catalogue record will be created for it.");

            var supplierKey = hasSupplier ? Key(source.SupplierName) : "";
            var supplierWasSeen = hasSupplier && !fileSupplierKeys.Add(supplierKey);
            if (hasSupplier && supplierNames.Contains(supplierKey))
                warnings.Add("Matching supplier already exists; its contact record will be reused.");
            else if (supplierWasSeen)
                warnings.Add("This supplier appears on another row; one supplier record will be created for it.");

            var quantity = 0;
            if (!string.IsNullOrWhiteSpace(source.OpeningQuantity) &&
                (!int.TryParse(source.OpeningQuantity, NumberStyles.Integer, CultureInfo.InvariantCulture, out quantity) || quantity < 0))
                errors.Add("OpeningQuantity must be a whole number zero or greater.");
            DateOnly? expiryDate = null; decimal costPrice = 0; decimal salePrice = 0;
            if (quantity > 0)
            {
                if (!hasMedicine) errors.Add("Enter a medicine name for opening stock.");
                if (string.IsNullOrWhiteSpace(source.BatchNumber)) errors.Add("BatchNumber is required when OpeningQuantity is above zero.");
                else if (source.BatchNumber.Length > 100) errors.Add("BatchNumber cannot exceed 100 characters.");
                if (!TryExpiryDate(source.ExpiryDate, out var expiry)) errors.Add("ExpiryDate must be a valid date (Excel dates and YYYY-MM-DD are accepted).");
                else if (expiry <= today) errors.Add("Opening stock expiry must be a future date.");
                else expiryDate = expiry;
                if (!TryPrice(source.UnitCost, out costPrice)) errors.Add("UnitCost must be zero or greater.");
                if (!TryPrice(source.SalePrice, out salePrice)) errors.Add("SalePrice must be zero or greater.");
                if (expiryDate is not null && hasMedicine && source.BatchNumber.Length <= 100)
                {
                    var batchKey = $"{medicineKey}\u001f{Key(source.BatchNumber)}\u001f{expiryDate:yyyy-MM-dd}";
                    if (!fileBatches.Add(batchKey)) errors.Add("This medicine, batch number and expiry date are repeated in the file.");
                    var matchedBatch = existingMedicine is null ? null : batches.FirstOrDefault(item => item.MedicineId == existingMedicine.Id &&
                        Key(item.Number) == Key(source.BatchNumber) && item.ExpiryDate == expiryDate);
                    if (matchedBatch is not null && (matchedBatch.CostPrice != costPrice || matchedBatch.SalePrice != salePrice))
                        errors.Add("An existing batch has different prices. Correct the file before adding its stock.");
                    else if (matchedBatch is not null) warnings.Add("Stock will be added to the matching existing batch.");
                }
            }
            else if (!string.IsNullOrWhiteSpace(source.BatchNumber) || !string.IsNullOrWhiteSpace(source.ExpiryDate) ||
                     !string.IsNullOrWhiteSpace(source.UnitCost) || !string.IsNullOrWhiteSpace(source.SalePrice))
                warnings.Add("Batch details are ignored because OpeningQuantity is zero or blank.");

            result.Add(new CheckedImportRow(source, medicineKey, minimumStock, requiresPrescription, quantity,
                expiryDate, costPrice, salePrice, errors, warnings));
        }
        return result;
    }

    private static ImportPreview Summarize(IReadOnlyList<CheckedImportRow> rows) => new(
        rows.Count, rows.Count(row => row.Errors.Count == 0), rows.Count(row => row.Errors.Count > 0),
        rows.Select(row => new ImportPreviewRow(row.Source.RowNumber, row.Source.MedicineName, row.Source.SupplierName,
            row.OpeningQuantity, row.Errors, row.Warnings)).ToArray());

    private static string MedicineKey(Medicine medicine) => MedicineKey(medicine.Name, medicine.GenericName, medicine.Strength, medicine.DosageForm);
    private static string MedicineKey(string name, string? genericName, string? strength, string? dosageForm) =>
        string.Join("\u001f", new[] { name, genericName ?? "", strength ?? "", dosageForm ?? "" }.Select(Key));
    private static string Key(string value) => value.Trim().ToUpperInvariant();
    private static string? Clean(string value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool TryBoolean(string value, out bool result)
    {
        switch (value.Trim().ToLowerInvariant())
        {
            case "true": case "yes": case "1": result = true; return true;
            case "false": case "no": case "0": result = false; return true;
            default: result = false; return false;
        }
    }

    private static bool TryPrice(string value, out decimal price) => decimal.TryParse(value, NumberStyles.Number,
        CultureInfo.InvariantCulture, out price) && price >= 0;

    private static bool TryExpiryDate(string value, out DateOnly expiry)
    {
        if (DateOnly.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out expiry)) return true;
        if (double.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var serial))
        {
            try { expiry = DateOnly.FromDateTime(DateTime.FromOADate(serial)); return true; }
            catch (ArgumentException) { }
        }
        expiry = default; return false;
    }

    private sealed record CheckedImportRow(ImportSheetRow Source, string MedicineKey, int MinimumStock,
        bool RequiresPrescription, int OpeningQuantity, DateOnly? ExpiryDate, decimal UnitCost, decimal SalePrice,
        List<string> Errors, List<string> Warnings);
}

public sealed record ImportFileRequest(string FileName, string FileContentBase64);
public sealed record ImportPreview(int RowCount, int ReadyCount, int ErrorCount, IReadOnlyList<ImportPreviewRow> Rows);
public sealed record ImportPreviewRow(int RowNumber, string MedicineName, string SupplierName, int OpeningQuantity,
    IReadOnlyList<string> Errors, IReadOnlyList<string> Warnings);

namespace MedicalStore.Api.Modules.Medicines;

public sealed record MedicineRequest(string Name, string? GenericName, string? Barcode, int MinimumStock,
    bool RequiresPrescription, string? Strength = null, string? DosageForm = null,
    string? Manufacturer = null, string? Description = null);

public sealed record MedicineStatusRequest(bool IsActive);

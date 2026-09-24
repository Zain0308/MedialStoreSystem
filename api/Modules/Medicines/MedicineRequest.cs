namespace MedicalStore.Api.Modules.Medicines;

public sealed record MedicineRequest(string Name, string? GenericName, string? Barcode, int MinimumStock, bool RequiresPrescription);

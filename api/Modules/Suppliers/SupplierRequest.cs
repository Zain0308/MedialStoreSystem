namespace MedicalStore.Api.Modules.Suppliers;

public sealed record SupplierRequest(string Name, string? Phone, string? ContactPerson = null, string? Email = null, string? Address = null);

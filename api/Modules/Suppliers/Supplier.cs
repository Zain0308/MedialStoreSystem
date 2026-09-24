
namespace MedicalStore.Api.Modules.Suppliers;

public sealed class Supplier
{
    public long Id { get; set; }
    public required string Name { get; set; }
    public string? Phone { get; set; }
}

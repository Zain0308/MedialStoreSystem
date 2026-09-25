namespace MedicalStore.Api.Modules.Stores;

public sealed class Store
{
    public long Id { get; set; }
    public required string Name { get; set; }
    public required string Code { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class UserStore
{
    public required string UserId { get; set; }
    public long StoreId { get; set; }
    public bool IsDefault { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Store Store { get; set; } = null!;
}

public sealed record CreateStoreRequest(string? Name, string? Code);
public sealed record UpdateUserStoresRequest(long[]? StoreIds, long? DefaultStoreId);
public sealed record SwitchStoreRequest(long StoreId);
public sealed record StoreSummary(long Id, string Name, string Code, bool IsDefault);

namespace MedicalStore.Api.Modules.Stores;

public sealed class Store
{
    public long Id { get; set; }
    public required string Name { get; set; }
    public required string Code { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string SubscriptionPlan { get; set; } = "Trial";
    public string SubscriptionStatus { get; set; } = "Trial";
    public DateTimeOffset? TrialEndsAt { get; set; } = DateTimeOffset.UtcNow.AddDays(14);
    public DateTimeOffset? SubscriptionExpiresAt { get; set; }
}

public sealed class StoreMembership
{
    public required string UserId { get; set; }
    public long StoreId { get; set; }
    public bool IsDefault { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Store Store { get; set; } = null!;
}

public sealed class StorePermissionGrant
{
    public long StoreId { get; set; }
    public required string PermissionKey { get; set; }
}

public sealed record CreateStoreRequest(string? Name, string? Code);
public sealed record UpdateUserStoresRequest(long[]? StoreIds, long? DefaultStoreId);
public sealed record SwitchStoreRequest(long StoreId);
public sealed record StoreSummary(long Id, string Name, string Code, bool IsDefault);
public sealed record UpdateStoreStatusRequest(bool IsActive);
public sealed record UpdateStoreSubscriptionRequest(string? PlanName, string? Status,
    DateTimeOffset? TrialEndsAt, DateTimeOffset? SubscriptionExpiresAt);
public sealed record UpdateStorePermissionsRequest(string[]? Permissions);

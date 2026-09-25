namespace MedicalStore.Api.Modules.Stores;

public static class StoreSubscriptionAccess
{
    public static bool IsAvailable(Store store, DateTimeOffset now) =>
        store.IsActive &&
        ((string.Equals(store.SubscriptionStatus, "Active", StringComparison.OrdinalIgnoreCase) &&
          (!store.SubscriptionExpiresAt.HasValue || store.SubscriptionExpiresAt.Value > now)) ||
         (string.Equals(store.SubscriptionStatus, "Trial", StringComparison.OrdinalIgnoreCase) &&
          store.TrialEndsAt.HasValue && store.TrialEndsAt.Value > now));

    public static bool IsExpired(Store store, DateTimeOffset now)
    {
        if (!store.IsActive) return false;
        var expiry = string.Equals(store.SubscriptionStatus, "Active", StringComparison.OrdinalIgnoreCase)
            ? store.SubscriptionExpiresAt
            : string.Equals(store.SubscriptionStatus, "Trial", StringComparison.OrdinalIgnoreCase)
                ? store.TrialEndsAt
                : null;
        return expiry.HasValue && expiry.Value <= now;
    }

    public static bool CanSignIn(Store store, DateTimeOffset now) => IsAvailable(store, now) || IsExpired(store, now);

    public static DateTimeOffset? GetExpiry(Store store) =>
        string.Equals(store.SubscriptionStatus, "Active", StringComparison.OrdinalIgnoreCase)
            ? store.SubscriptionExpiresAt
            : string.Equals(store.SubscriptionStatus, "Trial", StringComparison.OrdinalIgnoreCase)
                ? store.TrialEndsAt
                : null;
}

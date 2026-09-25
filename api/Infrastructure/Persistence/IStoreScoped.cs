namespace MedicalStore.Api.Infrastructure.Persistence;

public interface IStoreScoped
{
    long StoreId { get; set; }
}

public sealed class CurrentStoreContext
{
    public long? StoreId { get; private set; }
    public bool SubscriptionExpired { get; private set; }
    public void Select(long storeId, bool subscriptionExpired = false)
    {
        StoreId = storeId;
        SubscriptionExpired = subscriptionExpired;
    }
    public void Clear()
    {
        StoreId = null;
        SubscriptionExpired = false;
    }
}

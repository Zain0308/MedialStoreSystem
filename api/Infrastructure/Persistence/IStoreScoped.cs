namespace MedicalStore.Api.Infrastructure.Persistence;

public interface IStoreScoped
{
    long StoreId { get; set; }
}

public sealed class CurrentStoreContext
{
    public long? StoreId { get; private set; }
    public void Select(long storeId) => StoreId = storeId;
    public void Clear() => StoreId = null;
}

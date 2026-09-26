/* Keep the Inventory quick action independently permissioned from purchase maintenance. */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

INSERT dbo.StorePermissionGrants (StoreId, PermissionKey)
SELECT s.Id, N'purchases.create'
FROM dbo.Stores s
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.StorePermissionGrants g
    WHERE g.StoreId = s.Id AND g.PermissionKey = N'purchases.create'
);

COMMIT TRANSACTION;

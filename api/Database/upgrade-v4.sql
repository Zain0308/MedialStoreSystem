/*
  App Owner controls: subscriptions, trials, and store-level feature permissions.
  Existing stores are grandfathered as active.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.Stores', N'SubscriptionPlan') IS NULL
    ALTER TABLE dbo.Stores ADD SubscriptionPlan nvarchar(80) NOT NULL
        CONSTRAINT DF_Stores_SubscriptionPlan DEFAULT N'Legacy';
IF COL_LENGTH(N'dbo.Stores', N'SubscriptionStatus') IS NULL
    ALTER TABLE dbo.Stores ADD SubscriptionStatus nvarchar(20) NOT NULL
        CONSTRAINT DF_Stores_SubscriptionStatus DEFAULT N'Active';
IF COL_LENGTH(N'dbo.Stores', N'TrialEndsAt') IS NULL
    ALTER TABLE dbo.Stores ADD TrialEndsAt datetimeoffset NULL;
IF COL_LENGTH(N'dbo.Stores', N'SubscriptionExpiresAt') IS NULL
    ALTER TABLE dbo.Stores ADD SubscriptionExpiresAt datetimeoffset NULL;

IF OBJECT_ID(N'dbo.StorePermissionGrants', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.StorePermissionGrants (
        StoreId bigint NOT NULL,
        PermissionKey nvarchar(80) NOT NULL,
        CONSTRAINT PK_StorePermissionGrants PRIMARY KEY (StoreId, PermissionKey),
        CONSTRAINT FK_StorePermissionGrants_Stores_StoreId FOREIGN KEY (StoreId)
            REFERENCES dbo.Stores(Id) ON DELETE CASCADE
    );
END;

INSERT dbo.StorePermissionGrants (StoreId, PermissionKey)
SELECT s.Id, p.PermissionKey
FROM dbo.Stores s
CROSS JOIN (VALUES
    (N'users.manage'), (N'roles.manage'), (N'medicines.read'), (N'medicines.manage'),
    (N'inventory.read'), (N'inventory.manage'), (N'purchases.read'), (N'purchases.manage'),
    (N'sales.read'), (N'sales.create'), (N'sales.manage'), (N'suppliers.read'),
    (N'suppliers.manage'), (N'reports.read')
) p(PermissionKey)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.StorePermissionGrants g
    WHERE g.StoreId = s.Id AND g.PermissionKey = p.PermissionKey
);

COMMIT TRANSACTION;

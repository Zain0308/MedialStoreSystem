/*
   Multi-store isolation upgrade. Existing records and users are assigned to Main Store.
   The script is idempotent and runs automatically during API startup.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.Stores', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stores (
        Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Stores PRIMARY KEY,
        Name nvarchar(160) NOT NULL,
        Code nvarchar(40) NOT NULL,
        IsActive bit NOT NULL CONSTRAINT DF_Stores_IsActive DEFAULT 1,
        CreatedAt datetimeoffset NOT NULL CONSTRAINT DF_Stores_CreatedAt DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT UQ_Stores_Code UNIQUE (Code)
    );
END;

IF OBJECT_ID('dbo.UserStores', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserStores (
        UserId nvarchar(450) NOT NULL,
        StoreId bigint NOT NULL,
        IsDefault bit NOT NULL CONSTRAINT DF_UserStores_IsDefault DEFAULT 0,
        CreatedAt datetimeoffset NOT NULL CONSTRAINT DF_UserStores_CreatedAt DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT PK_UserStores PRIMARY KEY (UserId, StoreId),
        CONSTRAINT FK_UserStores_AspNetUsers_UserId FOREIGN KEY (UserId) REFERENCES dbo.AspNetUsers(Id) ON DELETE CASCADE,
        CONSTRAINT FK_UserStores_Stores_StoreId FOREIGN KEY (StoreId) REFERENCES dbo.Stores(Id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.Stores WHERE Code = N'MAIN')
BEGIN
    -- EnsureCreated may already have created the newer subscription columns.
    -- Older databases reach this script before upgrade-v4 adds those columns.
    IF COL_LENGTH(N'dbo.Stores', N'SubscriptionPlan') IS NOT NULL
        INSERT dbo.Stores (Name, Code, IsActive, CreatedAt, SubscriptionPlan, SubscriptionStatus, TrialEndsAt)
        VALUES (N'Main Store', N'MAIN', 1, SYSDATETIMEOFFSET(), N'Trial', N'Trial', DATEADD(day, 14, SYSDATETIMEOFFSET()));
    ELSE
        INSERT dbo.Stores (Name, Code, IsActive, CreatedAt) VALUES (N'Main Store', N'MAIN', 1, SYSDATETIMEOFFSET());
END;

DECLARE @DefaultStoreId bigint = (SELECT TOP (1) Id FROM dbo.Stores WHERE Code = N'MAIN');
DECLARE @Tables TABLE (TableName sysname NOT NULL PRIMARY KEY);
INSERT @Tables (TableName) VALUES
    (N'Medicines'), (N'Suppliers'), (N'Batches'), (N'Purchases'), (N'PurchaseLines'),
    (N'PurchaseReturns'), (N'PurchaseReturnLines'), (N'SupplierPayments'), (N'Sales'),
    (N'SaleLines'), (N'SaleReturns'), (N'SaleReturnLines'), (N'StockMovements');

DECLARE @TableName sysname;
DECLARE @Sql nvarchar(max);
DECLARE StoreTableCursor CURSOR LOCAL FAST_FORWARD FOR SELECT TableName FROM @Tables;
OPEN StoreTableCursor;
FETCH NEXT FROM StoreTableCursor INTO @TableName;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF COL_LENGTH(N'dbo.' + @TableName, 'StoreId') IS NULL
    BEGIN
        SET @Sql = N'ALTER TABLE dbo.' + QUOTENAME(@TableName) + N' ADD StoreId bigint NULL;';
        EXEC sys.sp_executesql @Sql;
    END;

    SET @Sql = N'UPDATE dbo.' + QUOTENAME(@TableName) + N' SET StoreId = @StoreId WHERE StoreId IS NULL;';
    EXEC sys.sp_executesql @Sql, N'@StoreId bigint', @StoreId = @DefaultStoreId;

    IF EXISTS (
        SELECT 1 FROM sys.columns c
        WHERE c.object_id = OBJECT_ID(N'dbo.' + @TableName)
          AND c.name = N'StoreId' AND c.is_nullable = 1
    )
    BEGIN
        SET @Sql = N'ALTER TABLE dbo.' + QUOTENAME(@TableName) + N' ALTER COLUMN StoreId bigint NOT NULL;';
        EXEC sys.sp_executesql @Sql;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = N'FK_' + @TableName + N'_Stores_StoreId'
          AND parent_object_id = OBJECT_ID(N'dbo.' + @TableName)
    )
    BEGIN
        SET @Sql = N'ALTER TABLE dbo.' + QUOTENAME(@TableName) + N' WITH CHECK ADD CONSTRAINT '
            + QUOTENAME(N'FK_' + @TableName + N'_Stores_StoreId')
            + N' FOREIGN KEY (StoreId) REFERENCES dbo.Stores(Id);';
        EXEC sys.sp_executesql @Sql;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_' + @TableName + N'_StoreId'
          AND object_id = OBJECT_ID(N'dbo.' + @TableName)
    )
    BEGIN
        SET @Sql = N'CREATE INDEX ' + QUOTENAME(N'IX_' + @TableName + N'_StoreId')
            + N' ON dbo.' + QUOTENAME(@TableName) + N'(StoreId);';
        EXEC sys.sp_executesql @Sql;
    END;

    FETCH NEXT FROM StoreTableCursor INTO @TableName;
END;
CLOSE StoreTableCursor;
DEALLOCATE StoreTableCursor;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Medicines') AND name = N'IX_Medicines_Barcode')
    DROP INDEX IX_Medicines_Barcode ON dbo.Medicines;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Medicines') AND name = N'IX_Medicines_StoreId_Barcode')
    CREATE UNIQUE INDEX IX_Medicines_StoreId_Barcode ON dbo.Medicines(StoreId, Barcode) WHERE Barcode IS NOT NULL;

IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Purchases') AND name = N'IX_Purchases_SupplierId_SupplierInvoice')
    DROP INDEX IX_Purchases_SupplierId_SupplierInvoice ON dbo.Purchases;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Purchases') AND name = N'IX_Purchases_StoreId_SupplierId_SupplierInvoice')
    CREATE UNIQUE INDEX IX_Purchases_StoreId_SupplierId_SupplierInvoice ON dbo.Purchases(StoreId, SupplierId, SupplierInvoice);

IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Sales') AND name = N'IX_Sales_InvoiceNumber')
    DROP INDEX IX_Sales_InvoiceNumber ON dbo.Sales;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Sales') AND name = N'IX_Sales_StoreId_InvoiceNumber')
    CREATE UNIQUE INDEX IX_Sales_StoreId_InvoiceNumber ON dbo.Sales(StoreId, InvoiceNumber);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.UserStores') AND name = N'IX_UserStores_StoreId')
    CREATE INDEX IX_UserStores_StoreId ON dbo.UserStores(StoreId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.UserStores') AND name = N'IX_UserStores_UserId_IsDefault')
    CREATE UNIQUE INDEX IX_UserStores_UserId_IsDefault ON dbo.UserStores(UserId, IsDefault) WHERE IsDefault = 1;

INSERT dbo.UserStores (UserId, StoreId, IsDefault, CreatedAt)
SELECT u.Id, @DefaultStoreId, 1, SYSDATETIMEOFFSET()
FROM dbo.AspNetUsers u
WHERE NOT EXISTS (SELECT 1 FROM dbo.UserStores us WHERE us.UserId = u.Id);

;WITH UsersWithoutDefault AS (
    SELECT UserId, MIN(StoreId) AS StoreId
    FROM dbo.UserStores
    GROUP BY UserId
    HAVING MAX(CASE WHEN IsDefault = 1 THEN 1 ELSE 0 END) = 0
)
UPDATE us SET IsDefault = 1
FROM dbo.UserStores us
INNER JOIN UsersWithoutDefault u ON u.UserId = us.UserId AND u.StoreId = us.StoreId;

COMMIT TRANSACTION;

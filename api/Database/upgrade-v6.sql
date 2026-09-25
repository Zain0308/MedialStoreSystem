/* Store-scoped customer credit, supplier activation, expenses and reporting data. */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.Suppliers', N'IsActive') IS NULL
    ALTER TABLE dbo.Suppliers ADD IsActive bit NOT NULL CONSTRAINT DF_Suppliers_IsActive DEFAULT (1);

IF OBJECT_ID(N'dbo.Customers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Customers (
        Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Customers PRIMARY KEY,
        StoreId bigint NOT NULL,
        Name nvarchar(200) NOT NULL,
        Phone nvarchar(40) NULL,
        Email nvarchar(254) NULL,
        CreditLimit decimal(18,2) NOT NULL CONSTRAINT DF_Customers_CreditLimit DEFAULT (0),
        IsActive bit NOT NULL CONSTRAINT DF_Customers_IsActive DEFAULT (1),
        CONSTRAINT FK_Customers_Stores_StoreId FOREIGN KEY (StoreId) REFERENCES dbo.Stores(Id)
    );
    CREATE INDEX IX_Customers_StoreId_Name ON dbo.Customers(StoreId, Name);
END;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Customers_Stores_StoreId')
    ALTER TABLE dbo.Customers ADD CONSTRAINT FK_Customers_Stores_StoreId FOREIGN KEY (StoreId) REFERENCES dbo.Stores(Id);

IF COL_LENGTH(N'dbo.Sales', N'CustomerId') IS NULL
    ALTER TABLE dbo.Sales ADD CustomerId bigint NULL;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Sales_Customers_CustomerId')
    ALTER TABLE dbo.Sales ADD CONSTRAINT FK_Sales_Customers_CustomerId FOREIGN KEY (CustomerId) REFERENCES dbo.Customers(Id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.Sales') AND name = N'IX_Sales_StoreId_CustomerId')
    CREATE INDEX IX_Sales_StoreId_CustomerId ON dbo.Sales(StoreId, CustomerId);

IF OBJECT_ID(N'dbo.CustomerPayments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.CustomerPayments (
        Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_CustomerPayments PRIMARY KEY,
        StoreId bigint NOT NULL,
        CustomerId bigint NOT NULL,
        SaleId bigint NOT NULL,
        Amount decimal(18,2) NOT NULL,
        Method nvarchar(30) NOT NULL,
        Reference nvarchar(100) NULL,
        PaidAt datetimeoffset NOT NULL,
        CONSTRAINT FK_CustomerPayments_Customers_CustomerId FOREIGN KEY (CustomerId) REFERENCES dbo.Customers(Id),
        CONSTRAINT FK_CustomerPayments_Sales_SaleId FOREIGN KEY (SaleId) REFERENCES dbo.Sales(Id)
    );
    CREATE INDEX IX_CustomerPayments_StoreId_CustomerId ON dbo.CustomerPayments(StoreId, CustomerId);
    CREATE INDEX IX_CustomerPayments_SaleId ON dbo.CustomerPayments(SaleId);
END;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_CustomerPayments_Customers_CustomerId')
    ALTER TABLE dbo.CustomerPayments ADD CONSTRAINT FK_CustomerPayments_Customers_CustomerId FOREIGN KEY (CustomerId) REFERENCES dbo.Customers(Id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_CustomerPayments_Sales_SaleId')
    ALTER TABLE dbo.CustomerPayments ADD CONSTRAINT FK_CustomerPayments_Sales_SaleId FOREIGN KEY (SaleId) REFERENCES dbo.Sales(Id);

IF OBJECT_ID(N'dbo.ExpenseCategories', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ExpenseCategories (
        Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ExpenseCategories PRIMARY KEY,
        StoreId bigint NOT NULL,
        Name nvarchar(100) NOT NULL,
        IsActive bit NOT NULL CONSTRAINT DF_ExpenseCategories_IsActive DEFAULT (1),
        CONSTRAINT FK_ExpenseCategories_Stores_StoreId FOREIGN KEY (StoreId) REFERENCES dbo.Stores(Id)
    );
    CREATE UNIQUE INDEX IX_ExpenseCategories_StoreId_Name ON dbo.ExpenseCategories(StoreId, Name);
END;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ExpenseCategories_Stores_StoreId')
    ALTER TABLE dbo.ExpenseCategories ADD CONSTRAINT FK_ExpenseCategories_Stores_StoreId FOREIGN KEY (StoreId) REFERENCES dbo.Stores(Id);

IF OBJECT_ID(N'dbo.Expenses', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Expenses (
        Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_Expenses PRIMARY KEY,
        StoreId bigint NOT NULL,
        CategoryId bigint NOT NULL,
        Description nvarchar(240) NOT NULL,
        Amount decimal(18,2) NOT NULL,
        ExpenseDate date NOT NULL,
        PaymentMethod nvarchar(30) NOT NULL,
        Reference nvarchar(100) NULL,
        Notes nvarchar(500) NULL,
        ActorId nvarchar(450) NOT NULL,
        CONSTRAINT FK_Expenses_Categories_CategoryId FOREIGN KEY (CategoryId) REFERENCES dbo.ExpenseCategories(Id),
        CONSTRAINT FK_Expenses_Stores_StoreId FOREIGN KEY (StoreId) REFERENCES dbo.Stores(Id)
    );
    CREATE INDEX IX_Expenses_StoreId_ExpenseDate ON dbo.Expenses(StoreId, ExpenseDate);
END;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Expenses_Categories_CategoryId')
    ALTER TABLE dbo.Expenses ADD CONSTRAINT FK_Expenses_Categories_CategoryId FOREIGN KEY (CategoryId) REFERENCES dbo.ExpenseCategories(Id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Expenses_Stores_StoreId')
    ALTER TABLE dbo.Expenses ADD CONSTRAINT FK_Expenses_Stores_StoreId FOREIGN KEY (StoreId) REFERENCES dbo.Stores(Id);

INSERT dbo.StorePermissionGrants (StoreId, PermissionKey)
SELECT s.Id, p.PermissionKey
FROM dbo.Stores s
CROSS JOIN (VALUES (N'customers.read'), (N'customers.manage'), (N'expenses.read'), (N'expenses.manage')) p(PermissionKey)
WHERE NOT EXISTS (SELECT 1 FROM dbo.StorePermissionGrants g WHERE g.StoreId = s.Id AND g.PermissionKey = p.PermissionKey);

COMMIT TRANSACTION;

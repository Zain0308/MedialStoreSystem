/*
   MedicalStoreSystem schema upgrade v2.
   Applied automatically by DatabaseInitializer at API startup after EnsureCreatedAsync.
   Safe to run more than once. Existing tables and rows are preserved.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.Medicines', 'Strength') IS NULL ALTER TABLE dbo.Medicines ADD Strength nvarchar(80) NULL;
IF COL_LENGTH('dbo.Medicines', 'DosageForm') IS NULL ALTER TABLE dbo.Medicines ADD DosageForm nvarchar(80) NULL;
IF COL_LENGTH('dbo.Medicines', 'Manufacturer') IS NULL ALTER TABLE dbo.Medicines ADD Manufacturer nvarchar(160) NULL;
IF COL_LENGTH('dbo.Medicines', 'Description') IS NULL ALTER TABLE dbo.Medicines ADD Description nvarchar(1000) NULL;

IF COL_LENGTH('dbo.StockMovements', 'Reason') IS NULL
BEGIN
    ALTER TABLE dbo.StockMovements ADD Reason nvarchar(300) NOT NULL CONSTRAINT DF_StockMovements_Reason DEFAULT N'';
END;
IF COL_LENGTH('dbo.StockMovements', 'ActorId') IS NULL ALTER TABLE dbo.StockMovements ADD ActorId nvarchar(450) NULL;
IF COL_LENGTH('dbo.PurchaseLines', 'ReturnedQuantity') IS NULL
BEGIN
    ALTER TABLE dbo.PurchaseLines ADD ReturnedQuantity int NOT NULL CONSTRAINT DF_PurchaseLines_ReturnedQuantity DEFAULT 0;
END;
IF COL_LENGTH('dbo.Sales', 'Subtotal') IS NULL
BEGIN
    ALTER TABLE dbo.Sales ADD Subtotal decimal(18,2) NOT NULL CONSTRAINT DF_Sales_Subtotal DEFAULT 0;
    EXEC sys.sp_executesql N'UPDATE dbo.Sales SET Subtotal = Total;';
END;
IF COL_LENGTH('dbo.Sales', 'DiscountAmount') IS NULL ALTER TABLE dbo.Sales ADD DiscountAmount decimal(18,2) NOT NULL CONSTRAINT DF_Sales_DiscountAmount DEFAULT 0;
IF COL_LENGTH('dbo.Sales', 'PaymentMethod') IS NULL ALTER TABLE dbo.Sales ADD PaymentMethod nvarchar(30) NOT NULL CONSTRAINT DF_Sales_PaymentMethod DEFAULT N'Cash';
IF COL_LENGTH('dbo.SaleLines', 'DiscountAmount') IS NULL ALTER TABLE dbo.SaleLines ADD DiscountAmount decimal(18,2) NOT NULL CONSTRAINT DF_SaleLines_DiscountAmount DEFAULT 0;
IF COL_LENGTH('dbo.SaleLines', 'ReturnedQuantity') IS NULL ALTER TABLE dbo.SaleLines ADD ReturnedQuantity int NOT NULL CONSTRAINT DF_SaleLines_ReturnedQuantity DEFAULT 0;

IF OBJECT_ID('dbo.PurchaseReturns', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PurchaseReturns (
        Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_PurchaseReturns PRIMARY KEY,
        PurchaseId bigint NOT NULL,
        SupplierReference nvarchar(100) NOT NULL,
        Reason nvarchar(300) NOT NULL,
        CreatedAt datetimeoffset NOT NULL,
        Total decimal(18,2) NOT NULL,
        CONSTRAINT FK_PurchaseReturns_Purchases_PurchaseId FOREIGN KEY (PurchaseId) REFERENCES dbo.Purchases(Id)
    );
    CREATE INDEX IX_PurchaseReturns_PurchaseId ON dbo.PurchaseReturns(PurchaseId);
END;

IF OBJECT_ID('dbo.PurchaseReturnLines', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PurchaseReturnLines (
        Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_PurchaseReturnLines PRIMARY KEY,
        PurchaseReturnId bigint NOT NULL,
        PurchaseLineId bigint NOT NULL,
        BatchId bigint NOT NULL,
        Quantity int NOT NULL,
        UnitCost decimal(18,4) NOT NULL,
        CONSTRAINT FK_PurchaseReturnLines_PurchaseReturns_PurchaseReturnId FOREIGN KEY (PurchaseReturnId) REFERENCES dbo.PurchaseReturns(Id) ON DELETE CASCADE,
        CONSTRAINT FK_PurchaseReturnLines_PurchaseLines_PurchaseLineId FOREIGN KEY (PurchaseLineId) REFERENCES dbo.PurchaseLines(Id)
    );
    CREATE INDEX IX_PurchaseReturnLines_PurchaseReturnId ON dbo.PurchaseReturnLines(PurchaseReturnId);
    CREATE INDEX IX_PurchaseReturnLines_PurchaseLineId ON dbo.PurchaseReturnLines(PurchaseLineId);
END;

IF OBJECT_ID('dbo.SupplierPayments', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SupplierPayments (
        Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_SupplierPayments PRIMARY KEY,
        PurchaseId bigint NOT NULL,
        Amount decimal(18,2) NOT NULL,
        Method nvarchar(30) NOT NULL,
        Reference nvarchar(120) NULL,
        PaidAt datetimeoffset NOT NULL,
        CONSTRAINT FK_SupplierPayments_Purchases_PurchaseId FOREIGN KEY (PurchaseId) REFERENCES dbo.Purchases(Id)
    );
    CREATE INDEX IX_SupplierPayments_PurchaseId ON dbo.SupplierPayments(PurchaseId);
END;

IF OBJECT_ID('dbo.SaleReturns', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SaleReturns (
        Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_SaleReturns PRIMARY KEY,
        SaleId bigint NOT NULL,
        CreatedAt datetimeoffset NOT NULL,
        Reason nvarchar(300) NOT NULL,
        RefundMethod nvarchar(30) NOT NULL,
        TotalRefund decimal(18,2) NOT NULL,
        CONSTRAINT FK_SaleReturns_Sales_SaleId FOREIGN KEY (SaleId) REFERENCES dbo.Sales(Id)
    );
    CREATE INDEX IX_SaleReturns_SaleId ON dbo.SaleReturns(SaleId);
END;

IF OBJECT_ID('dbo.SaleReturnLines', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SaleReturnLines (
        Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_SaleReturnLines PRIMARY KEY,
        SaleReturnId bigint NOT NULL,
        SaleLineId bigint NOT NULL,
        BatchId bigint NOT NULL,
        Quantity int NOT NULL,
        Restocked bit NOT NULL,
        UnitRefund decimal(18,4) NOT NULL,
        CONSTRAINT FK_SaleReturnLines_SaleReturns_SaleReturnId FOREIGN KEY (SaleReturnId) REFERENCES dbo.SaleReturns(Id) ON DELETE CASCADE,
        CONSTRAINT FK_SaleReturnLines_SaleLines_SaleLineId FOREIGN KEY (SaleLineId) REFERENCES dbo.SaleLines(Id)
    );
    CREATE INDEX IX_SaleReturnLines_SaleReturnId ON dbo.SaleReturnLines(SaleReturnId);
    CREATE INDEX IX_SaleReturnLines_SaleLineId ON dbo.SaleReturnLines(SaleLineId);
END;

COMMIT TRANSACTION;

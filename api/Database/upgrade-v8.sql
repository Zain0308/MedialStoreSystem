/* Purchase quantity correction audit records. Idempotent and applied at API startup. */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.PurchaseCorrections', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PurchaseCorrections (
        Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_PurchaseCorrections PRIMARY KEY,
        StoreId bigint NOT NULL,
        PurchaseId bigint NOT NULL,
        Reason nvarchar(300) NOT NULL,
        ActorId nvarchar(450) NULL,
        CreatedAt datetimeoffset NOT NULL,
        PreviousTotal decimal(18,2) NOT NULL,
        CorrectedTotal decimal(18,2) NOT NULL,
        CONSTRAINT FK_PurchaseCorrections_Stores_StoreId FOREIGN KEY (StoreId) REFERENCES dbo.Stores(Id),
        CONSTRAINT FK_PurchaseCorrections_Purchases_PurchaseId FOREIGN KEY (PurchaseId) REFERENCES dbo.Purchases(Id)
    );
    CREATE INDEX IX_PurchaseCorrections_StoreId ON dbo.PurchaseCorrections(StoreId);
    CREATE INDEX IX_PurchaseCorrections_PurchaseId ON dbo.PurchaseCorrections(PurchaseId);
END;

IF OBJECT_ID(N'dbo.PurchaseCorrectionLines', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PurchaseCorrectionLines (
        Id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_PurchaseCorrectionLines PRIMARY KEY,
        StoreId bigint NOT NULL,
        PurchaseCorrectionId bigint NOT NULL,
        PurchaseLineId bigint NOT NULL,
        PreviousQuantity int NOT NULL,
        CorrectedQuantity int NOT NULL,
        QuantityChange int NOT NULL,
        CONSTRAINT FK_PurchaseCorrectionLines_Stores_StoreId FOREIGN KEY (StoreId) REFERENCES dbo.Stores(Id),
        CONSTRAINT FK_PurchaseCorrectionLines_PurchaseCorrections_PurchaseCorrectionId FOREIGN KEY (PurchaseCorrectionId) REFERENCES dbo.PurchaseCorrections(Id) ON DELETE CASCADE,
        CONSTRAINT FK_PurchaseCorrectionLines_PurchaseLines_PurchaseLineId FOREIGN KEY (PurchaseLineId) REFERENCES dbo.PurchaseLines(Id)
    );
    CREATE INDEX IX_PurchaseCorrectionLines_StoreId ON dbo.PurchaseCorrectionLines(StoreId);
    CREATE INDEX IX_PurchaseCorrectionLines_PurchaseCorrectionId ON dbo.PurchaseCorrectionLines(PurchaseCorrectionId);
    CREATE INDEX IX_PurchaseCorrectionLines_PurchaseLineId ON dbo.PurchaseCorrectionLines(PurchaseLineId);
END;

COMMIT TRANSACTION;

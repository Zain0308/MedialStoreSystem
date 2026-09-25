/* Supplier directory contact details. Existing suppliers remain unchanged. */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.Suppliers', N'ContactPerson') IS NULL
    ALTER TABLE dbo.Suppliers ADD ContactPerson nvarchar(120) NULL;
IF COL_LENGTH(N'dbo.Suppliers', N'Email') IS NULL
    ALTER TABLE dbo.Suppliers ADD Email nvarchar(254) NULL;
IF COL_LENGTH(N'dbo.Suppliers', N'Address') IS NULL
    ALTER TABLE dbo.Suppliers ADD Address nvarchar(300) NULL;

COMMIT TRANSACTION;

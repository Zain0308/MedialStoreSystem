/* Phone and other supplier contact details are optional. */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.Suppliers') AND name = N'Phone' AND is_nullable = 0
)
    ALTER TABLE dbo.Suppliers ALTER COLUMN Phone nvarchar(40) NULL;

COMMIT TRANSACTION;

/* Remove the retired per-customer credit limit. */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.Customers', N'CreditLimit') IS NOT NULL
BEGIN
    DECLARE @creditLimitDefault sysname;
    DECLARE @sql nvarchar(max);

    SELECT @creditLimitDefault = dc.name
    FROM sys.default_constraints AS dc
    INNER JOIN sys.columns AS c
        ON c.object_id = dc.parent_object_id
        AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.Customers')
      AND c.name = N'CreditLimit';

    IF @creditLimitDefault IS NOT NULL
    BEGIN
        SET @sql = N'ALTER TABLE dbo.Customers DROP CONSTRAINT '
                 + QUOTENAME(@creditLimitDefault);

        EXEC sp_executesql @sql;
    END;

    ALTER TABLE dbo.Customers DROP COLUMN CreditLimit;
END;

COMMIT TRANSACTION;
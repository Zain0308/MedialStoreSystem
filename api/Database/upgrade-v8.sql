/* Preserve create-purchase access for roles that already had purchase management access. */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.DatabaseUpgradeHistory', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DatabaseUpgradeHistory (
        UpgradeKey nvarchar(100) NOT NULL CONSTRAINT PK_DatabaseUpgradeHistory PRIMARY KEY,
        AppliedAt datetimeoffset NOT NULL CONSTRAINT DF_DatabaseUpgradeHistory_AppliedAt DEFAULT SYSDATETIMEOFFSET()
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.DatabaseUpgradeHistory WHERE UpgradeKey = N'purchase-create-role-permissions-v1')
BEGIN
    INSERT dbo.AspNetRoleClaims (RoleId, ClaimType, ClaimValue)
    SELECT DISTINCT oldManage.RoleId, N'permission', N'purchases.create'
    FROM dbo.AspNetRoleClaims oldManage
    WHERE oldManage.ClaimType = N'permission'
      AND oldManage.ClaimValue = N'purchases.manage'
      AND NOT EXISTS (
          SELECT 1 FROM dbo.AspNetRoleClaims existingCreate
          WHERE existingCreate.RoleId = oldManage.RoleId
            AND existingCreate.ClaimType = N'permission'
            AND existingCreate.ClaimValue = N'purchases.create'
      );

    INSERT dbo.DatabaseUpgradeHistory (UpgradeKey)
    VALUES (N'purchase-create-role-permissions-v1');
END;

COMMIT TRANSACTION;

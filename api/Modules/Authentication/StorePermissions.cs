namespace MedicalStore.Api.Modules.Authentication;

public static class StoreRoles
{
    public const string Administrator = "Administrator";
    public const string Pharmacist = "Pharmacist";
    public const string Cashier = "Cashier";
    public const string InventoryManager = "Inventory Manager";
}

public static class StorePermissions
{
    public const string UsersManage = "users.manage";
    public const string ApplicationOwnerPolicy = "application-owner";
    public const string DashboardPolicy = "dashboard-access";
    public const string RolesManage = "roles.manage";
    public const string MedicinesRead = "medicines.read";
    public const string MedicinesManage = "medicines.manage";
    public const string InventoryRead = "inventory.read";
    public const string InventoryManage = "inventory.manage";
    public const string PurchasesRead = "purchases.read";
    public const string PurchasesManage = "purchases.manage";
    public const string SalesRead = "sales.read";
    public const string SalesCreate = "sales.create";
    public const string SalesManage = "sales.manage";
    public const string SuppliersRead = "suppliers.read";
    public const string SuppliersManage = "suppliers.manage";
    public const string CustomersRead = "customers.read";
    public const string CustomersManage = "customers.manage";
    public const string ExpensesRead = "expenses.read";
    public const string ExpensesManage = "expenses.manage";
    public const string ReportsRead = "reports.read";

    public static readonly IReadOnlyDictionary<string, string> All = new Dictionary<string, string>
    {
        [UsersManage] = "Manage users and roles",
        [RolesManage] = "Create roles and change permissions",
        [MedicinesRead] = "View medicines",
        [MedicinesManage] = "Create, edit and deactivate medicines",
        [InventoryRead] = "View inventory",
        [InventoryManage] = "Adjust inventory",
        [PurchasesRead] = "View purchases",
        [PurchasesManage] = "Receive purchases",
        [SalesRead] = "View sales and receipts",
        [SalesCreate] = "Create sales at POS",
        [SalesManage] = "Process sales returns and discounts",
        [SuppliersRead] = "View suppliers",
        [SuppliersManage] = "Add and manage suppliers",
        [ReportsRead] = "View reports and dashboard",
        [CustomersRead] = "View customers and balances",
        [CustomersManage] = "Manage customers and record payments",
        [ExpensesRead] = "View expenses",
        [ExpensesManage] = "Manage expense categories and entries"
    };

    public static readonly IReadOnlyDictionary<string, string[]> DefaultRoles = new Dictionary<string, string[]>
    {
        [StoreRoles.Administrator] = All.Keys.ToArray(),
        [StoreRoles.Pharmacist] = [MedicinesRead, InventoryRead, PurchasesRead, SalesRead, SalesCreate, SalesManage, SuppliersRead, ReportsRead],
        [StoreRoles.Cashier] = [MedicinesRead, InventoryRead, SalesRead, SalesCreate],
        [StoreRoles.InventoryManager] = [MedicinesRead, MedicinesManage, InventoryRead, InventoryManage, PurchasesRead, PurchasesManage, SalesRead, SuppliersRead, ReportsRead]
    };
}

using System.Security.Claims;
using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Authentication;
using Microsoft.EntityFrameworkCore;

namespace MedicalStore.Api.Modules.Expenses;

public static class ExpenseEndpoints
{
    private static readonly string[] Methods = ["Cash", "Card", "Bank Transfer", "Mobile Wallet"];

    public static void MapExpenseEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/expenses/categories", async (StoreDb db) => Results.Ok(await db.ExpenseCategories.AsNoTracking()
            .OrderBy(x => x.Name).ToListAsync())).RequireAuthorization(StorePermissions.ExpensesRead);
        api.MapPost("/expenses/categories", async (ExpenseCategoryRequest input, StoreDb db) =>
        {
            var name = input.Name?.Trim();
            if (string.IsNullOrWhiteSpace(name) || name.Length > 100) return Results.BadRequest("Category name is required (up to 100 characters).");
            if (await db.ExpenseCategories.AnyAsync(x => x.Name == name)) return Results.Conflict("That category already exists.");
            var category = new ExpenseCategory { Name = name };
            db.ExpenseCategories.Add(category); await db.SaveChangesAsync();
            return Results.Created($"/api/expenses/categories/{category.Id}", category);
        }).RequireAuthorization(StorePermissions.ExpensesManage);
        api.MapPut("/expenses/categories/{id:long}/status", async (long id, ExpenseCategoryStatusRequest input, StoreDb db) =>
        {
            var category = await db.ExpenseCategories.SingleOrDefaultAsync(x => x.Id == id);
            if (category is null) return Results.NotFound();
            category.IsActive = input.IsActive; await db.SaveChangesAsync();
            return Results.Ok(category);
        }).RequireAuthorization(StorePermissions.ExpensesManage);

        api.MapGet("/expenses", async (DateOnly? from, DateOnly? to, long? categoryId, StoreDb db) =>
        {
            if (from.HasValue && to.HasValue && from > to) return Results.BadRequest("From date must be on or before To date.");
            var query = db.Expenses.AsNoTracking().AsQueryable();
            if (from.HasValue) query = query.Where(x => x.ExpenseDate >= from.Value);
            if (to.HasValue) query = query.Where(x => x.ExpenseDate <= to.Value);
            if (categoryId.HasValue) query = query.Where(x => x.CategoryId == categoryId.Value);
            return Results.Ok(await query.OrderByDescending(x => x.ExpenseDate).ThenByDescending(x => x.Id)
                .Select(x => new { x.Id, x.CategoryId, category = db.ExpenseCategories.Where(c => c.Id == x.CategoryId).Select(c => c.Name).First(),
                    x.Description, x.Amount, x.ExpenseDate, x.PaymentMethod, x.Reference, x.Notes }).ToListAsync());
        }).RequireAuthorization(StorePermissions.ExpensesRead);
        api.MapPost("/expenses", async (ExpenseRequest input, StoreDb db, ClaimsPrincipal principal) =>
        {
            var method = input.PaymentMethod?.Trim();
            if (decimal.Round(input.Amount, 2) <= 0 || input.Amount >= 1_000_000_000m || string.IsNullOrWhiteSpace(input.Description) || input.Description.Trim().Length > 240 ||
                method is null || !Methods.Contains(method, StringComparer.OrdinalIgnoreCase) || (input.Reference?.Length ?? 0) > 100 || (input.Notes?.Length ?? 0) > 500)
                return Results.BadRequest("Enter a description, positive amount, supported payment method and valid optional details.");
            if (!await db.ExpenseCategories.AnyAsync(x => x.Id == input.CategoryId && x.IsActive)) return Results.BadRequest("Select an active expense category.");
            var expense = new Expense { CategoryId = input.CategoryId, Description = input.Description.Trim(), Amount = decimal.Round(input.Amount, 2),
                ExpenseDate = input.ExpenseDate, PaymentMethod = method, Reference = Clean(input.Reference), Notes = Clean(input.Notes),
                ActorId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "" };
            db.Expenses.Add(expense); await db.SaveChangesAsync();
            return Results.Created($"/api/expenses/{expense.Id}", new { expense.Id });
        }).RequireAuthorization(StorePermissions.ExpensesManage);
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed record ExpenseCategoryRequest(string Name);
public sealed record ExpenseCategoryStatusRequest(bool IsActive);
public sealed record ExpenseRequest(long CategoryId, string Description, decimal Amount, DateOnly ExpenseDate, string PaymentMethod, string? Reference, string? Notes);

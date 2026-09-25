using MedicalStore.Api.Infrastructure.Persistence;
using MedicalStore.Api.Modules.Authentication;
using Microsoft.EntityFrameworkCore;

namespace MedicalStore.Api.Modules.Customers;

public static class CustomerEndpoints
{
    private static readonly string[] PaymentMethods = ["Cash", "Card", "Bank Transfer", "Mobile Wallet"];
    private static readonly string[] NotReceivedMethods = ["Not Received", "Credit"];

    public static void MapCustomerEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/customers", async (StoreDb db) =>
        {
            var customers = await db.Customers.AsNoTracking().OrderBy(x => x.Name).ToListAsync();
            var sales = await db.Sales.AsNoTracking().Where(x => x.CustomerId != null)
                .Select(x => new { CustomerId = x.CustomerId!.Value, x.Total, Returned = x.Returns.Sum(r => (decimal?)r.TotalRefund) ?? 0,
                    x.PaymentMethod, Paid = db.CustomerPayments.Where(p => p.SaleId == x.Id).Sum(p => (decimal?)p.Amount) ?? 0 }).ToListAsync();
            var balances = sales.GroupBy(x => x.CustomerId).ToDictionary(g => g.Key, g => new
            {
                paidTotal = g.Sum(x => NotReceivedMethods.Contains(x.PaymentMethod)
                    ? Math.Min(x.Paid, Math.Max(0, x.Total - x.Returned)) : Math.Max(0, x.Total - x.Returned)),
                receivable = g.Where(x => NotReceivedMethods.Contains(x.PaymentMethod))
                    .Sum(x => Math.Max(0, x.Total - x.Returned - x.Paid))
            });
            return Results.Ok(customers.Select(x => new { x.Id, x.Name, x.Phone, x.Email, x.IsActive,
                paidTotal = balances.GetValueOrDefault(x.Id)?.paidTotal ?? 0,
                receivable = balances.GetValueOrDefault(x.Id)?.receivable ?? 0 }));
        }).RequireAuthorization(StorePermissions.CustomersRead);

        api.MapPost("/customers", async (CustomerRequest input, StoreDb db) =>
        {
            if (!Valid(input)) return Results.BadRequest("Enter a customer name and valid contact details.");
            var customer = new Customer { Name = input.Name.Trim(), Phone = Clean(input.Phone), Email = Clean(input.Email) };
            db.Customers.Add(customer);
            await db.SaveChangesAsync();
            return Results.Created($"/api/customers/{customer.Id}", new { customer.Id });
        }).RequireAuthorization(StorePermissions.CustomersManage);

        api.MapPut("/customers/{id:long}", async (long id, CustomerRequest input, StoreDb db) =>
        {
            if (!Valid(input)) return Results.BadRequest("Enter a customer name and valid contact details.");
            var customer = await db.Customers.SingleOrDefaultAsync(x => x.Id == id);
            if (customer is null) return Results.NotFound();
            customer.Name = input.Name.Trim(); customer.Phone = Clean(input.Phone); customer.Email = Clean(input.Email);
            await db.SaveChangesAsync();
            return Results.Ok(new { customer.Id, customer.Name, customer.Phone, customer.Email, customer.IsActive });
        }).RequireAuthorization(StorePermissions.CustomersManage);

        api.MapPut("/customers/{id:long}/status", async (long id, CustomerStatusRequest input, StoreDb db) =>
        {
            var customer = await db.Customers.SingleOrDefaultAsync(x => x.Id == id);
            if (customer is null) return Results.NotFound();
            customer.IsActive = input.IsActive;
            await db.SaveChangesAsync();
            return Results.Ok(new { customer.Id, customer.IsActive });
        }).RequireAuthorization(StorePermissions.CustomersManage);

        api.MapGet("/customers/{id:long}/ledger", async (long id, StoreDb db) =>
        {
            var customer = await db.Customers.AsNoTracking().Where(x => x.Id == id)
                .Select(x => new { x.Id, x.Name, x.Phone, x.Email, x.IsActive }).SingleOrDefaultAsync();
            if (customer is null) return Results.NotFound();
            var customerSales = await db.Sales.AsNoTracking().Where(x => x.CustomerId == id)
                .Select(x => new { x.Total, x.PaymentMethod, Returned = x.Returns.Sum(r => (decimal?)r.TotalRefund) ?? 0,
                    Paid = db.CustomerPayments.Where(p => p.SaleId == x.Id).Sum(p => (decimal?)p.Amount) ?? 0 }).ToListAsync();
            var paidTotal = customerSales.Sum(x => NotReceivedMethods.Contains(x.PaymentMethod)
                ? Math.Min(x.Paid, Math.Max(0, x.Total - x.Returned)) : Math.Max(0, x.Total - x.Returned));
            var invoices = await db.Sales.AsNoTracking().Where(x => x.CustomerId == id && NotReceivedMethods.Contains(x.PaymentMethod))
                .OrderByDescending(x => x.CreatedAt).Select(x => new
                {
                    x.Id, x.InvoiceNumber, x.CreatedAt, x.Total,
                    returned = x.Returns.Sum(r => (decimal?)r.TotalRefund) ?? 0,
                    paid = db.CustomerPayments.Where(p => p.SaleId == x.Id).Sum(p => (decimal?)p.Amount) ?? 0,
                    payments = db.CustomerPayments.Where(p => p.SaleId == x.Id).OrderByDescending(p => p.PaidAt)
                        .Select(p => new { p.Id, p.Amount, p.Method, p.Reference, p.PaidAt })
                }).ToListAsync();
            return Results.Ok(new { customer, invoices, paidTotal, receivable = invoices.Sum(x => Math.Max(0, x.Total - x.returned - x.paid)) });
        }).RequireAuthorization(StorePermissions.CustomersRead);

        api.MapPost("/customers/{id:long}/payments", async (long id, CustomerPaymentRequest input, StoreDb db) =>
        {
            var method = input.Method?.Trim();
            var amount = decimal.Round(input.Amount, 2);
            if (amount <= 0 || method is null || !PaymentMethods.Contains(method, StringComparer.OrdinalIgnoreCase))
                return Results.BadRequest("Payment amount and a supported payment method are required.");
            method = PaymentMethods.Single(x => string.Equals(x, method, StringComparison.OrdinalIgnoreCase));
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var sale = await db.Sales.SingleOrDefaultAsync(x => x.Id == input.SaleId && x.CustomerId == id && NotReceivedMethods.Contains(x.PaymentMethod));
            if (sale is null) return Results.NotFound("Unpaid invoice not found for this customer.");
            var returned = await db.SaleReturns.Where(x => x.SaleId == sale.Id).SumAsync(x => (decimal?)x.TotalRefund) ?? 0;
            var paid = await db.CustomerPayments.Where(x => x.SaleId == sale.Id).SumAsync(x => (decimal?)x.Amount) ?? 0;
            var due = Math.Max(0, sale.Total - returned - paid);
            if (amount > due) return Results.Conflict($"Payment cannot exceed the invoice balance of {due:0.00}.");
            var payment = new CustomerPayment { CustomerId = id, SaleId = sale.Id, Amount = amount,
                Method = method, Reference = Clean(input.Reference) };
            db.CustomerPayments.Add(payment);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            return Results.Created($"/api/customers/{id}/payments/{payment.Id}", new { payment.Id, payment.Amount, due = due - payment.Amount });
        }).RequireAuthorization(StorePermissions.CustomersManage);
    }

    private static bool Valid(CustomerRequest input) => !string.IsNullOrWhiteSpace(input.Name) && input.Name.Trim().Length <= 200 &&
        (input.Phone?.Length ?? 0) <= 40 && (input.Email?.Length ?? 0) <= 254;
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed record CustomerRequest(string Name, string? Phone, string? Email);
public sealed record CustomerStatusRequest(bool IsActive);
public sealed record CustomerPaymentRequest(long SaleId, decimal Amount, string Method, string? Reference);

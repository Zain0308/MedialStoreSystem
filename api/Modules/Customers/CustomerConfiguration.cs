using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MedicalStore.Api.Modules.Customers;

public sealed class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(200);
        builder.Property(x => x.Phone).HasMaxLength(40);
        builder.Property(x => x.Email).HasMaxLength(254);
        builder.Property(x => x.CreditLimit).HasPrecision(18, 2);
        builder.HasIndex(x => new { x.StoreId, x.Name });
    }
}

public sealed class CustomerPaymentConfiguration : IEntityTypeConfiguration<CustomerPayment>
{
    public void Configure(EntityTypeBuilder<CustomerPayment> builder)
    {
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.Method).HasMaxLength(30);
        builder.Property(x => x.Reference).HasMaxLength(100);
        builder.HasIndex(x => new { x.StoreId, x.CustomerId });
        builder.HasIndex(x => x.SaleId);
    }
}

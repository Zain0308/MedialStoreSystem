namespace MedicalStore.Api.Modules.Sales;

public sealed class SaleReturn
{
    public long Id { get; set; }
    public long SaleId { get; set; }
    public Sale Sale { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string Reason { get; set; } = "";
    public string RefundMethod { get; set; } = "Cash";
    public decimal TotalRefund { get; set; }
    public List<SaleReturnLine> Lines { get; set; } = [];
}

public sealed class SaleReturnLine
{
    public long Id { get; set; }
    public long SaleReturnId { get; set; }
    public SaleReturn SaleReturn { get; set; } = null!;
    public long SaleLineId { get; set; }
    public SaleLine SaleLine { get; set; } = null!;
    public long BatchId { get; set; }
    public int Quantity { get; set; }
    public bool Restocked { get; set; }
    public decimal UnitRefund { get; set; }
}

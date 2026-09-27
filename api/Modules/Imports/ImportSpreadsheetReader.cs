using System.Globalization;
using System.IO.Compression;
using System.Xml.Linq;

namespace MedicalStore.Api.Modules.Imports;

internal static class ImportSpreadsheetReader
{
    private static readonly string[] Headers =
    [
        "MedicineName", "GenericName", "Strength", "DosageForm", "Manufacturer", "Barcode", "MinimumStock",
        "RequiresPrescription", "SupplierName", "ContactPerson", "Phone", "Email", "Address", "BatchNumber",
        "ExpiryDate", "OpeningQuantity", "UnitCost", "SalePrice"
    ];

    public static IReadOnlyList<ImportSheetRow> Read(string fileName, string fileContentBase64)
    {
        if (string.IsNullOrWhiteSpace(fileName) || string.IsNullOrWhiteSpace(fileContentBase64))
            throw new InvalidDataException("Choose an Excel (.xlsx) or CSV file first.");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(fileContentBase64); }
        catch (FormatException) { throw new InvalidDataException("The uploaded file could not be read. Please choose it again."); }
        if (bytes.Length == 0 || bytes.Length > 8 * 1024 * 1024)
            throw new InvalidDataException("The import file must be under 8 MB.");

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        return extension switch
        {
            ".csv" => ReadCsv(bytes),
            ".xlsx" => ReadXlsx(bytes),
            _ => throw new InvalidDataException("Choose an Excel (.xlsx) or CSV file.")
        };
    }

    public static string TemplateCsv => string.Join(",", Headers) + "\r\n" +
        "Paracetamol,Paracetamol,500 mg,Tablet,Example Pharma,,10,false,ABC Pharma,Ali Khan,03001234567,,Karachi,LOT-001,2027-12-31,100,10,15\r\n";

    private static IReadOnlyList<ImportSheetRow> ReadCsv(byte[] bytes)
    {
        var text = System.Text.Encoding.UTF8.GetString(bytes).TrimStart('\uFEFF');
        var records = text.Split(["\r\n", "\n", "\r"], StringSplitOptions.None)
            .Select((line, index) => (Cells: ParseCsvLine(line), RowNumber: index + 1))
            .Where(row => row.Cells.Any(cell => !string.IsNullOrWhiteSpace(cell))).ToList();
        if (records.Count < 2) throw new InvalidDataException("The file has no data rows.");
        var headers = BuildHeaderMap(records[0].Cells);
        return records.Skip(1).Select(row => MakeRow(row.RowNumber, headers, row.Cells)).ToArray();
    }

    private static IReadOnlyList<ImportSheetRow> ReadXlsx(byte[] bytes)
    {
        try
        {
            using var stream = new MemoryStream(bytes);
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
            var mainNs = XNamespace.Get("http://schemas.openxmlformats.org/spreadsheetml/2006/main");
            var relNs = XNamespace.Get("http://schemas.openxmlformats.org/officeDocument/2006/relationships");
            var packageRelNs = XNamespace.Get("http://schemas.openxmlformats.org/package/2006/relationships");
            var workbook = LoadXml(archive, "xl/workbook.xml");
            var relationId = (string?)workbook.Root?.Element(mainNs + "sheets")?.Elements(mainNs + "sheet").FirstOrDefault()?.Attribute(relNs + "id");
            if (string.IsNullOrWhiteSpace(relationId)) throw new InvalidDataException("The workbook has no worksheet.");
            var relationships = LoadXml(archive, "xl/_rels/workbook.xml.rels");
            var target = (string?)relationships.Root?.Elements(packageRelNs + "Relationship")
                .SingleOrDefault(x => (string?)x.Attribute("Id") == relationId)?.Attribute("Target");
            if (string.IsNullOrWhiteSpace(target)) throw new InvalidDataException("The workbook worksheet could not be found.");
            var sheetPath = target.StartsWith('/') ? target.TrimStart('/') : "xl/" + target.TrimStart('/');
            var sheet = LoadXml(archive, sheetPath);
            var sharedStrings = archive.GetEntry("xl/sharedStrings.xml") is { } stringsEntry
                ? LoadXml(stringsEntry).Root?.Elements(mainNs + "si").Select(x => string.Concat(x.Descendants(mainNs + "t").Select(t => t.Value))).ToArray() ?? Array.Empty<string>()
                : Array.Empty<string>();
            var parsedRows = new List<(int RowNumber, List<string> Cells)>();
            foreach (var row in sheet.Descendants(mainNs + "sheetData").Elements(mainNs + "row"))
            {
                var cells = new List<string>();
                foreach (var cell in row.Elements(mainNs + "c"))
                {
                    var column = ColumnIndex((string?)cell.Attribute("r") ?? "A1");
                    while (cells.Count <= column) cells.Add("");
                    var type = (string?)cell.Attribute("t");
                    var value = cell.Element(mainNs + "v")?.Value ?? "";
                    cells[column] = type switch
                    {
                        "s" when int.TryParse(value, out var index) && index >= 0 && index < sharedStrings.Length => sharedStrings[index],
                        "inlineStr" => string.Concat(cell.Descendants(mainNs + "t").Select(t => t.Value)),
                        _ => value
                    };
                }
                if (cells.Any(cell => !string.IsNullOrWhiteSpace(cell)))
                    parsedRows.Add((int.TryParse((string?)row.Attribute("r"), out var line) ? line : parsedRows.Count + 1, cells));
            }
            if (parsedRows.Count < 2) throw new InvalidDataException("The first worksheet has no data rows.");
            var headers = BuildHeaderMap(parsedRows[0].Cells);
            return parsedRows.Skip(1).Select(row => MakeRow(row.RowNumber, headers, row.Cells)).ToArray();
        }
        catch (InvalidDataException) { throw; }
        catch (Exception exception) when (exception is IOException or InvalidOperationException or ArgumentException or System.Xml.XmlException)
        {
            throw new InvalidDataException("This Excel file could not be opened. Save it as .xlsx and try again.", exception);
        }
    }

    private static XDocument LoadXml(ZipArchive archive, string path)
    {
        var entry = archive.GetEntry(path) ?? throw new InvalidDataException("The Excel workbook is missing a required worksheet file.");
        return LoadXml(entry);
    }

    private static XDocument LoadXml(ZipArchiveEntry entry)
    {
        using var stream = entry.Open();
        return XDocument.Load(stream);
    }

    private static ImportSheetRow MakeRow(int rowNumber, IReadOnlyDictionary<string, int> headers, IReadOnlyList<string> cells)
    {
        string Get(string name) => headers.TryGetValue(name, out var index) && index < cells.Count ? cells[index].Trim() : "";
        return new ImportSheetRow(rowNumber, Get("MedicineName"), Get("GenericName"), Get("Strength"), Get("DosageForm"),
            Get("Manufacturer"), Get("Barcode"), Get("MinimumStock"), Get("RequiresPrescription"), Get("SupplierName"),
            Get("ContactPerson"), Get("Phone"), Get("Email"), Get("Address"), Get("BatchNumber"), Get("ExpiryDate"),
            Get("OpeningQuantity"), Get("UnitCost"), Get("SalePrice"));
    }

    private static Dictionary<string, int> BuildHeaderMap(IReadOnlyList<string> cells)
    {
        var headers = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < cells.Count; i++)
        {
            var name = NormalizeHeader(cells[i]);
            if (Headers.Any(header => NormalizeHeader(header) == name))
                headers[Headers.Single(header => NormalizeHeader(header) == name)] = i;
        }
        if (!headers.ContainsKey("MedicineName") && !headers.ContainsKey("SupplierName"))
            throw new InvalidDataException("The header row must include MedicineName or SupplierName. Download the template for the full column list.");
        return headers;
    }

    private static string NormalizeHeader(string value) => new(value.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());

    private static int ColumnIndex(string reference)
    {
        var column = 0;
        foreach (var character in reference)
        {
            if (!char.IsLetter(character)) break;
            column = column * 26 + char.ToUpperInvariant(character) - 'A' + 1;
        }
        return Math.Max(0, column - 1);
    }

    private static List<string> ParseCsvLine(string line)
    {
        var cells = new List<string>(); var value = new System.Text.StringBuilder(); var quoted = false;
        for (var i = 0; i < line.Length; i++)
        {
            var character = line[i];
            if (character == '"')
            {
                if (quoted && i + 1 < line.Length && line[i + 1] == '"') { value.Append('"'); i++; }
                else quoted = !quoted;
            }
            else if (character == ',' && !quoted) { cells.Add(value.ToString()); value.Clear(); }
            else value.Append(character);
        }
        cells.Add(value.ToString());
        return cells;
    }
}

internal sealed record ImportSheetRow(int RowNumber, string MedicineName, string GenericName, string Strength, string DosageForm,
    string Manufacturer, string Barcode, string MinimumStock, string RequiresPrescription, string SupplierName,
    string ContactPerson, string Phone, string Email, string Address, string BatchNumber, string ExpiryDate,
    string OpeningQuantity, string UnitCost, string SalePrice);

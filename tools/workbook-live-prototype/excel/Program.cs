using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;

// A new Excel instance and a new blank workbook only. Never attaches to an
// existing Excel process or opens a pupil's/teacher's personal documents.
internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        using var adapter = new ExcelAdapter(args.Contains("--visible"));
        var index = Array.IndexOf(args, "--addresses");
        adapter.Addresses = (index < 0 ? "A1,A2,B1,B2,C1,C2,D1,D2" : args[index + 1]).Split(',');
        Console.WriteLine(JsonSerializer.Serialize(new { ready = true, engine = "Excel", addresses = adapter.Addresses }));
        string? line;
        while ((line = Console.ReadLine()) is not null)
        {
            var command = JsonNode.Parse(line)!.AsObject();
            if (command["type"]!.GetValue<string>() == "close") break;
            try { Console.WriteLine(JsonSerializer.Serialize(new { id = command["id"]!.GetValue<int>(), result = adapter.Execute(command) })); }
            catch (Exception error) { Console.WriteLine(JsonSerializer.Serialize(new { id = command["id"]!.GetValue<int>(), error = error.Message })); }
        }
    }
}

internal sealed class ExcelAdapter : IDisposable
{
    private readonly dynamic _app;
    private readonly dynamic _book;
    private readonly dynamic _sheet;
    public string[] Addresses { get; set; } = [];

    public ExcelAdapter(bool visible)
    {
        var type = Type.GetTypeFromProgID("Excel.Application") ?? throw new InvalidOperationException("Excel is not installed");
        _app = Activator.CreateInstance(type)!;
        _app.Visible = visible;
        _app.DisplayAlerts = false;
        _app.AutomationSecurity = 3; // msoAutomationSecurityForceDisable
        _book = _app.Workbooks.Add();
        _sheet = _book.Worksheets[1];
        _sheet.Name = "Live";
    }

    private static void Release(object? item)
    {
        if (item is not null && Marshal.IsComObject(item)) Marshal.FinalReleaseComObject(item);
    }

    private JsonObject ReadCell(string address)
    {
        dynamic cell = _sheet.Range[address];
        dynamic interior = cell.Interior;
        try
        {
            object? value = cell.Value2;
            JsonObject content;
            if ((bool)cell.HasFormula) content = new() { ["kind"] = "formula", ["value"] = (string)cell.Formula };
            else if (value is null) content = new() { ["kind"] = "empty" };
            else if (value is string text) content = new() { ["kind"] = "text", ["value"] = text };
            else if (value is bool) throw new InvalidOperationException("Boolean cells are outside the prototype scope");
            else content = new() { ["kind"] = "number", ["value"] = Convert.ToDouble(value) };
            int? color = null;
            if (Convert.ToInt32(interior.Pattern) != -4142)
            {
                var ole = Convert.ToInt32(interior.Color);
                color = (ole & 255) << 16 | ole & 0x00ff00 | (ole >> 16 & 255);
            }
            return new JsonObject { ["content"] = content, ["fill"] = color };
        }
        finally { Release(interior); Release(cell); }
    }

    private void WriteProperty(string address, string property, JsonNode? value)
    {
        dynamic cell = _sheet.Range[address];
        try
        {
            if (property == "fill")
            {
                dynamic interior = cell.Interior;
                try
                {
                    if (value is null) interior.Pattern = -4142;
                    else
                    {
                        var rgb = value.GetValue<int>();
                        interior.Pattern = 1;
                        interior.Color = (rgb & 255) << 16 | rgb & 0x00ff00 | (rgb >> 16 & 255);
                    }
                }
                finally { Release(interior); }
            }
            else
            {
                var content = value!.AsObject();
                switch (content["kind"]!.GetValue<string>())
                {
                    case "empty": cell.ClearContents(); break;
                    case "number": cell.Value2 = content["value"]!.GetValue<double>(); break;
                    case "formula": cell.Formula = content["value"]!.GetValue<string>(); break;
                    case "text": cell.Formula = "'" + content["value"]!.GetValue<string>(); break;
                    default: throw new InvalidOperationException("Unsupported content type");
                }
            }
        }
        finally { Release(cell); }
    }

    public object Execute(JsonObject command)
    {
        var type = command["type"]!.GetValue<string>();
        if (type == "snapshot")
        {
            var cells = new JsonObject();
            foreach (var address in Addresses) cells[address] = ReadCell(address);
            return new { cells };
        }
        if (type is "edit" or "apply")
        {
            var applied = new List<object>(); var skipped = new List<object>();
            foreach (var item in command["changes"]!.AsArray())
            {
                var change = item!.AsObject(); var address = change["address"]!.GetValue<string>();
                if (!Addresses.Contains(address)) throw new InvalidOperationException("Address outside the experimental range");
                foreach (var key in new[] { "content", "fill" })
                {
                    if (!change.ContainsKey(key)) continue;
                    if (type == "apply" && !JsonNode.DeepEquals(ReadCell(address)[key], change["expected"]![key]))
                    { skipped.Add(new { address, property = key }); continue; }
                    WriteProperty(address, key, change[key]);
                    applied.Add(new { address, property = key });
                }
            }
            return new { applied, skipped };
        }
        if (type == "evaluate")
        {
            dynamic cell = _sheet.Range[command["address"]!.GetValue<string>()];
            try { return new { value = (object?)cell.Value2, text = (string)cell.Text }; }
            finally { Release(cell); }
        }
        if (type == "save")
        {
            string path = Path.GetFullPath(command["path"]!.GetValue<string>());
            _book.SaveAs(path, 51); // xlOpenXMLWorkbook; no VBA project
            return new { saved = path };
        }
        throw new InvalidOperationException("Unknown adapter command");
    }

    public void Dispose()
    {
        try { _book.Close(false); } finally
        {
            try { _app.Quit(); } finally { Release(_sheet); Release(_book); Release(_app); }
        }
    }
}

using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace IvanEge.WorkbookHelper;

internal sealed class LiveExcelBridge : IDisposable
{
    private readonly dynamic _app;
    private readonly dynamic _book = null!;
    private readonly string _localPath;
    private readonly bool _hidden;
    private static void Release(object? value) { if (value is not null && Marshal.IsComObject(value)) Marshal.FinalReleaseComObject(value); }

    public LiveExcelBridge(string source, string localPath, bool hidden)
    {
        _localPath = localPath; _hidden = hidden;
        var type = Type.GetTypeFromProgID("Excel.Application") ?? throw new InvalidOperationException("Excel не установлен");
        _app = Activator.CreateInstance(type)!;
        try
        {
            _app.DisplayAlerts = false; _app.AutomationSecurity = 3; _app.AskToUpdateLinks = false;
            _book = _app.Workbooks.Open(Path.GetFullPath(source), UpdateLinks: 0, ReadOnly: false);
            // Excel imports a minimal ODS with zero named styles, then writes
            // an invalid empty cellStyles element on SaveAs. A named style is
            // required by OOXML even when no cell explicitly uses it.
            if ((int)_book.Styles.Count == 0) _book.Styles.Add("IVAN100");
            _book.SaveAs(localPath, 51); // Common file format, no macros.
            _app.Visible = !hidden;
        }
        catch { try { _app.Quit(); } finally { Release(_book); Release(_app); } throw; }
    }

    private dynamic Sheet(string name) => _book.Worksheets[name];
    private JsonObject ReadCell(dynamic sheet, string address)
    {
        dynamic cell = sheet.Range[address]; dynamic interior = cell.Interior;
        try
        {
            object? value = cell.Value2; JsonObject content;
            if ((bool)cell.HasFormula) content = new() { ["kind"] = "formula", ["value"] = ((string)cell.Formula).Replace("_xlfn.", "", StringComparison.Ordinal) };
            else if (value is null) content = new() { ["kind"] = "empty" };
            else if (value is string text) content = new() { ["kind"] = "text", ["value"] = text };
            else if (value is bool boolean) content = new() { ["kind"] = "boolean", ["value"] = boolean };
            else content = new() { ["kind"] = "number", ["value"] = Convert.ToDouble(value) };
            int? fill = null;
            if (Convert.ToInt32(interior.Pattern) != -4142)
            {
                var color = Convert.ToInt32(interior.Color); fill = (color & 255) << 16 | color & 0x00ff00 | color >> 16 & 255;
            }
            return new JsonObject { ["content"] = content, ["fill"] = fill };
        }
        finally { Release(interior); Release(cell); }
    }
    private static void WriteCell(dynamic sheet, string address, string property, JsonNode? value)
    {
        dynamic cell = sheet.Range[address];
        try
        {
            if (property == "fill")
            {
                dynamic interior = cell.Interior;
                try
                {
                    if (value is null) interior.Pattern = -4142;
                    else { int color = value.GetValue<int>(); interior.Pattern = 1; interior.Color = (color & 255) << 16 | color & 0x00ff00 | color >> 16 & 255; }
                }
                finally { Release(interior); }
            }
            else switch (value!["kind"]!.GetValue<string>())
            {
                case "empty": cell.ClearContents(); break;
                case "number": cell.Value2 = value["value"]!.GetValue<double>(); break;
                case "boolean": cell.Value2 = value["value"]!.GetValue<bool>(); break;
                case "text": cell.Formula = "'" + value["value"]!.GetValue<string>(); break;
                case "formula": cell.Formula = value["value"]!.GetValue<string>(); break;
                default: throw new FormatException("Неподдерживаемое содержимое ячейки");
            }
        }
        finally { Release(cell); }
    }

    public object Execute(JsonObject command)
    {
        switch (command["type"]!.GetValue<string>())
        {
            case "snapshot":
                string destination = command["path"]!.GetValue<string>(); _book.SaveCopyAs(destination); return new { path = destination, localPath = (string)_book.FullName };
            case "save": _book.Save(); return new { saved = true };
            case "apply":
                var changes = command["changes"]!.AsArray();
                // Validate all conditions before changing anything; user edits
                // that happened during a request must remain in the workbook.
                foreach (var change in changes)
                {
                    dynamic sheet = Sheet(change!["sheetName"]!.GetValue<string>());
                    try
                    {
                        if (!JsonNode.DeepEquals(ReadCell(sheet, change["address"]!.GetValue<string>())[change["property"]!.GetValue<string>()], change["expected"])) return new { skipped = true };
                    }
                    finally { Release(sheet); }
                }
                _app.EnableEvents = false; _app.ScreenUpdating = false;
                try
                {
                    foreach (var change in changes)
                    {
                        dynamic sheet = Sheet(change!["sheetName"]!.GetValue<string>());
                        try { WriteCell(sheet, change["address"]!.GetValue<string>(), change["property"]!.GetValue<string>(), change["value"]); }
                        finally { Release(sheet); }
                    }
                }
                finally { _app.EnableEvents = true; _app.ScreenUpdating = !_hidden; }
                return new { skipped = false };
            case "replace":
                Replace(command["book"]!.AsObject()); return new { replaced = true };
            case "evaluate":
                dynamic evaluationSheet = Sheet(command["sheetName"]!.GetValue<string>());
                dynamic cell = evaluationSheet.Range[command["address"]!.GetValue<string>()];
                try { return new { value = (object?)cell.Value2, text = (string)cell.Text }; }
                finally { Release(cell); Release(evaluationSheet); }
            case "edit":
                foreach (var change in command["changes"]!.AsArray())
                {
                    dynamic sheet = Sheet(change!["sheetName"]!.GetValue<string>());
                    try { WriteCell(sheet, change["address"]!.GetValue<string>(), change["property"]!.GetValue<string>(), change["value"]); }
                    finally { Release(sheet); }
                }
                return new { edited = true };
            case "insert-rows":
                dynamic insertSheet = Sheet(command["sheetName"]!.GetValue<string>());
                try { insertSheet.Rows[command["row"]!.GetValue<int>()].Insert(); }
                finally { Release(insertSheet); }
                return new { inserted = true };
            case "fill-down":
                dynamic fillSheet = Sheet(command["sheetName"]!.GetValue<string>()); dynamic range = fillSheet.Range[command["range"]!.GetValue<string>()];
                try { range.FillDown(); } finally { Release(range); Release(fillSheet); }
                return new { filled = true };
            case "theme-fill":
                dynamic themeSheet = Sheet(command["sheetName"]!.GetValue<string>()); dynamic themeCell = themeSheet.Range[command["address"]!.GetValue<string>()]; dynamic themeFill = themeCell.Interior;
                try { themeFill.Pattern = 1; themeFill.ThemeColor = 5; themeFill.TintAndShade = .4; }
                finally { Release(themeFill); Release(themeCell); Release(themeSheet); }
                return new { filled = true };
            case "load-test-data":
                dynamic dataSheet = Sheet(command["sheetName"]!.GetValue<string>()); int count = command["count"]!.GetValue<int>();
                if (count is < 1 or > 100000) throw new FormatException("Invalid fixture size");
                dynamic dataRange = dataSheet.Range["R1:R" + count];
                try { var values = new object[count, 1]; for (int i = 0; i < count; i++) values[i, 0] = (double)(i + 1); dataRange.Value2 = values; }
                finally { Release(dataRange); Release(dataSheet); }
                return new { loaded = true };
            default: throw new FormatException("Неизвестная команда общей таблицы");
        }
    }

    private void Replace(JsonObject book)
    {
        var sheets = book["sheets"]!.AsArray();
        _app.EnableEvents = false; _app.ScreenUpdating = false;
        try
        {
            // Reuse sheets in order, preserving workbook formatting and charts
            // outside changed cells; temporary names avoid rename collisions.
            while ((int)_book.Worksheets.Count < sheets.Count) _book.Worksheets.Add(After: _book.Worksheets[_book.Worksheets.Count]);
            for (var index = 1; index <= (int)_book.Worksheets.Count; index++)
            { dynamic sheet = _book.Worksheets[index]; try { sheet.Name = "_iv_" + index + "_" + Guid.NewGuid().ToString("N")[..8]; } finally { Release(sheet); } }
            while ((int)_book.Worksheets.Count > sheets.Count) { dynamic last = _book.Worksheets[_book.Worksheets.Count]; try { last.Delete(); } finally { Release(last); } }
            for (var index = 0; index < sheets.Count; index++)
            {
                dynamic sheet = _book.Worksheets[index + 1];
                try
                {
                    sheet.Name = sheets[index]!["name"]!.GetValue<string>(); dynamic used = sheet.UsedRange;
                    try { used.ClearContents(); dynamic fill = used.Interior; try { fill.Pattern = -4142; } finally { Release(fill); } } finally { Release(used); }
                }
                finally { Release(sheet); }
            }
            foreach (var source in sheets)
            {
                dynamic sheet = Sheet(source!["name"]!.GetValue<string>());
                try
                {
                    var cells = source["cells"]!.AsObject(); int maxRow = 0, maxColumn = 0;
                    foreach (var entry in cells) { var at = Position(entry.Key); maxRow = Math.Max(maxRow, at.Row); maxColumn = Math.Max(maxColumn, at.Column); }
                    if ((long)maxRow * maxColumn is > 0 and <= 500000)
                    {
                        var values = new object?[maxRow, maxColumn];
                        foreach (var entry in cells)
                        {
                            var at = Position(entry.Key); var content = entry.Value!["content"]!;
                            values[at.Row - 1, at.Column - 1] = content["kind"]!.GetValue<string>() switch
                            { "number" => content["value"]!.GetValue<double>(), "text" => "'" + content["value"]!.GetValue<string>(), "formula" => content["value"]!.GetValue<string>(), "boolean" => content["value"]!.GetValue<bool>(), _ => null };
                        }
                        dynamic range = sheet.Range["A1"].Resize[maxRow, maxColumn];
                        try { range.Formula = values; } finally { Release(range); }
                    }
                    else foreach (var entry in cells) WriteCell(sheet, entry.Key, "content", entry.Value!["content"]);
                    foreach (var group in cells.Where(cell => cell.Value!["fill"] is not null).GroupBy(cell => cell.Value!["fill"]!.GetValue<int>()))
                        foreach (var batch in group.Select(cell => cell.Key).Chunk(100)) WriteCell(sheet, string.Join(',', batch), "fill", JsonValue.Create(group.Key));
                }
                finally { Release(sheet); }
            }
        }
        finally { _app.EnableEvents = true; _app.ScreenUpdating = !_hidden; }
    }
    private static (int Row, int Column) Position(string address)
    {
        int col = 0, index = 0; foreach (char ch in address) { if (!char.IsAsciiLetterUpper(ch)) break; col = col * 26 + ch - 'A' + 1; index++; }
        return (int.Parse(address[index..]), col);
    }
    public void Dispose()
    {
        // Preserve a complete local recovery file before closing our own instance.
        try { if (!IsClosed()) { _book.Save(); _book.Close(false); } _app.Quit(); }
        catch { /* Leave an unsaved document open rather than discarding it. */ }
        finally { Release(_book); Release(_app); }
    }
    private bool IsClosed() { try { return (int)_book.Windows.Count == 0; } catch { return true; } }
    public static int Run(string[] args)
    {
        string Argument(string name) { var index = Array.IndexOf(args, name); if (index < 0 || index + 1 >= args.Length) throw new FormatException("Missing bridge argument"); return args[index + 1]; }
        try
        {
            using var bridge = new LiveExcelBridge(Argument("--file"), Argument("--local"), args.Contains("--hidden"));
            Console.WriteLine("{\"ready\":true}"); string? line;
            while ((line = Console.ReadLine()) is not null)
            {
                var input = JsonNode.Parse(line)!.AsObject(); if (input["type"]!.GetValue<string>() == "close") break;
                try { Console.WriteLine(JsonSerializer.Serialize(new { id = input["id"]!.GetValue<int>(), result = bridge.Execute(input) })); }
                catch (Exception error) { Console.WriteLine(JsonSerializer.Serialize(new { id = input["id"]!.GetValue<int>(), error = error.Message, closed = bridge.IsClosed() })); }
            }
            return 0;
        }
        catch (Exception error) { Console.WriteLine(JsonSerializer.Serialize(new { startupError = error.Message })); return 1; }
    }
}

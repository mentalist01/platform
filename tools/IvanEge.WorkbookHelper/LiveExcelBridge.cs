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
    private readonly LiveExcelChanges _changes = null!;
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
            _changes = new LiveExcelChanges(_app);
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
            case "pulse": return Pulse(command["peers"] as JsonArray ?? []);
            case "activate":
                dynamic activeWindow = _app.ActiveWindow;
                try { activeWindow.Activate(); return new { activated = true }; }
                finally { Release(activeWindow); }
            case "view":
                dynamic view = _app.ActiveWindow;
                try
                {
                    if (command["freezeRows"] is not null) { view.FreezePanes = false; view.SplitRow = command["freezeRows"]!.GetValue<int>(); view.SplitColumn = command["freezeColumns"]?.GetValue<int>() ?? 0; view.FreezePanes = (int)view.SplitRow > 0 || (int)view.SplitColumn > 0; }
                    view.Zoom = command["zoom"]!.GetValue<int>(); view.ScrollRow = command["row"]!.GetValue<int>() + 1; view.ScrollColumn = command["column"]!.GetValue<int>() + 1; return new { viewed = true };
                }
                finally { Release(view); }
            case "fixture-object":
                dynamic objectSheet = _app.ActiveSheet, objectShapes = objectSheet.Shapes;
                try
                {
                    dynamic shape = objectShapes.AddShape(1, 114, 85, 114, 57);
                    try { shape.Name = command["name"]!.GetValue<string>(); shape.Select(); return new { created = true }; }
                    finally { Release(shape); }
                }
                finally { Release(objectShapes); Release(objectSheet); }
            case "select":
                dynamic selectedSheet = Sheet(command["sheetName"]!.GetValue<string>());
                try
                {
                    selectedSheet.Activate();
                    dynamic? selectedCells = null;
                    try
                    {
                        foreach (var item in command["ranges"]!.AsArray())
                        {
                            var r = item!.AsArray(); string address = CellAddress(r[0]!.GetValue<int>(), r[1]!.GetValue<int>()) + ":" + CellAddress(r[2]!.GetValue<int>(), r[3]!.GetValue<int>());
                            dynamic next = selectedSheet.Range[address];
                            if (selectedCells is null) selectedCells = next;
                            else { dynamic combined = _app.Union(selectedCells, next); Release(selectedCells); Release(next); selectedCells = combined; }
                        }
                        selectedCells!.Select();
                    }
                    finally { Release(selectedCells); }
                    return new { selected = true };
                }
                finally { Release(selectedSheet); }
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

    private static string CellAddress(int row, int column)
    {
        string letters = ""; for (int n = column + 1; n > 0; n = (n - 1) / 26) letters = (char)('A' + (n - 1) % 26) + letters;
        return letters + (row + 1);
    }
    private static JsonArray RangeAddress(dynamic range)
    {
        dynamic rows = range.Rows, columns = range.Columns;
        try { int row = (int)range.Row - 1, col = (int)range.Column - 1; return new JsonArray(row, col, row + (int)rows.Count - 1, col + (int)columns.Count - 1); }
        finally { Release(rows); Release(columns); }
    }
    private JsonObject Pulse(JsonArray peers)
    {
        dynamic window = _app.ActiveWindow, sheet = _app.ActiveSheet, selected = _app.Selection, active = _app.ActiveCell;
        try
        {
            var ranges = new JsonArray(); var objects = new JsonArray(); string sheetName = sheet.Name;
            try
            {
                dynamic areas = selected.Areas;
                try { for (int i = 1; i <= Math.Min((int)areas.Count, 16); i++) { dynamic area = areas.Item[i]; try { ranges.Add(RangeAddress(area)); } finally { Release(area); } } }
                finally { Release(areas); }
            }
            catch (Exception error) when (error is COMException or Microsoft.CSharp.RuntimeBinder.RuntimeBinderException && error.HResult is not unchecked((int)0x80010001) and not unchecked((int)0x8001010A))
            {
                dynamic shapes = selected.ShapeRange;
                try { for (int i = 1; i <= Math.Min((int)shapes.Count, 16); i++) { dynamic shape = shapes.Item(i); try { string name = new(((string)shape.Name).Where(ch => !char.IsControl(ch)).Take(120).ToArray()); if (name.Length > 0) objects.Add(new JsonObject { ["name"] = name, ["kind"] = "shape" }); } finally { Release(shape); } } }
                finally { Release(shapes); }
            }
            var result = new JsonObject { ["serial"] = _changes.Serial, ["watching"] = _changes.Watching,
                ["selection"] = new JsonObject { ["sheetName"] = sheetName, ["ranges"] = ranges, ["objects"] = objects, ["activeCell"] = new JsonArray((int)active.Row - 1, (int)active.Column - 1) },
                ["window"] = Convert.ToInt64(_app.Hwnd), ["marks"] = new JsonArray(), ["view"] = null };
            if (_hidden || peers.Count == 0) return result;
            dynamic panes = window.Panes;
            try
            {
                for (int p = 1; p <= (int)panes.Count; p++)
                {
                    dynamic pane = panes.Item[p], visible = pane.VisibleRange;
                    try
                    {
                        Rectangle clip = ScreenRectangle(pane, visible);
                        if (result["view"] is JsonArray prior) clipView(Rectangle.Union(new Rectangle(prior[0]!.GetValue<int>(), prior[1]!.GetValue<int>(), prior[2]!.GetValue<int>(), prior[3]!.GetValue<int>()), clip));
                        else clipView(clip);
                        void clipView(Rectangle box) => result["view"] = new JsonArray(box.X, box.Y, box.Width, box.Height);
                        foreach (var peer in peers.Take(32))
                        {
                            if (peer!["selection"]!["sheetName"]!.GetValue<string>() != sheetName) continue;
                            void Mark(dynamic native)
                            {
                                Rectangle bounds = Rectangle.Intersect(clip, ScreenRectangle(pane, native));
                                if (bounds.Width > 0 && bounds.Height > 0) result["marks"]!.AsArray().Add(new JsonObject { ["bounds"] = new JsonArray(bounds.X, bounds.Y, bounds.Width, bounds.Height), ["name"] = peer["name"]!.DeepClone(), ["color"] = peer["color"]!.DeepClone() });
                            }
                            foreach (var item in peer["selection"]!["ranges"]!.AsArray().Take(16))
                            {
                                var r = item!.AsArray(); string address = CellAddress(r[0]!.GetValue<int>(), r[1]!.GetValue<int>()) + ":" + CellAddress(r[2]!.GetValue<int>(), r[3]!.GetValue<int>());
                                dynamic native = sheet.Range[address]; try { Mark(native); } finally { Release(native); }
                            }
                            foreach (var item in peer["selection"]!["objects"]!.AsArray().Take(16))
                            {
                                dynamic? shape = null; dynamic? shapes = null;
                                try { shapes = sheet.Shapes; shape = shapes.Item(item!["name"]!.GetValue<string>()); Mark(shape); }
                                catch (COMException) { /* An object absent in this copy has a text indicator instead. */ }
                                finally { Release(shape); Release(shapes); }
                            }
                        }
                    }
                    finally { Release(visible); Release(pane); }
                }
            }
            finally { Release(panes); }
            return result;
        }
        finally { Release(active); Release(selected); Release(sheet); Release(window); }
    }
    private static Rectangle ScreenRectangle(dynamic pane, dynamic item)
    {
        int x = pane.PointsToScreenPixelsX((int)Math.Round((double)item.Left)), y = pane.PointsToScreenPixelsY((int)Math.Round((double)item.Top));
        int right = pane.PointsToScreenPixelsX((int)Math.Round((double)item.Left + (double)item.Width)), bottom = pane.PointsToScreenPixelsY((int)Math.Round((double)item.Top + (double)item.Height));
        return new Rectangle(x, y, Math.Max(0, right - x), Math.Max(0, bottom - y));
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
        _changes?.Dispose();
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
            while (true)
            {
                var inputLine = Task.Run(Console.ReadLine);
                while (!inputLine.IsCompleted) { Application.DoEvents(); Thread.Sleep(5); }
                line = inputLine.GetAwaiter().GetResult(); if (line is null) break;
                var input = JsonNode.Parse(line)!.AsObject(); if (input["type"]!.GetValue<string>() == "close") break;
                try { Console.WriteLine(JsonSerializer.Serialize(new { id = input["id"]!.GetValue<int>(), result = bridge.Execute(input) })); }
                catch (Exception error) { Console.WriteLine(JsonSerializer.Serialize(new { id = input["id"]!.GetValue<int>(), error = error.Message, closed = bridge.IsClosed(), busy = error.HResult is unchecked((int)0x80010001) or unchecked((int)0x8001010A) })); }
            }
            return 0;
        }
        catch (Exception error) { Console.WriteLine(JsonSerializer.Serialize(new { startupError = error.Message })); return 1; }
    }
}

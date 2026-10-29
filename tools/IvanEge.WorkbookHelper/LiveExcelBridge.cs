using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace IvanEge.WorkbookHelper;

internal sealed class LiveExcelBridge : IDisposable
{
    private readonly dynamic _app = null!;
    private readonly dynamic _book = null!;
    private readonly string _localPath;
    private readonly bool _hidden;
    private readonly bool _borders;
    private readonly LiveExcelChanges _changes = null!;
    private static void Release(object? value) { if (value is not null && Marshal.IsComObject(value)) Marshal.FinalReleaseComObject(value); }

    public LiveExcelBridge(string source, string localPath, bool hidden, bool borders = false)
    {
        _localPath = localPath; _hidden = hidden; _borders = borders;
        string stage = "запуск приложения";
        try
        {
            var type = Type.GetTypeFromProgID("Excel.Application") ?? throw new InvalidOperationException("Excel не установлен или не зарегистрирован для совместной работы. Можно использовать LibreOffice.");
            _app = Activator.CreateInstance(type)!;
            // Make first-run/activation dialogs visible before opening/importing
            // a book. Hiding Excel until SaveAs can make startup look like no-op.
            stage = "показ окна приложения";
            _app.Visible = !hidden;
            stage = "настройка безопасного открытия";
            _app.DisplayAlerts = false; _app.AutomationSecurity = 3;
            try { _app.AskToUpdateLinks = false; }
            catch (Exception optional) when (optional is Microsoft.CSharp.RuntimeBinder.RuntimeBinderException || optional.HResult is unchecked((int)0x80020003) or unchecked((int)0x8002802B))
            { AppLog.Info("Excel does not expose AskToUpdateLinks; Workbooks.Open still disables link updates."); }
            stage = "открытие исходного файла";
            _book = _app.Workbooks.Open(Path.GetFullPath(source), 0, false);
            // Excel imports a minimal ODS with zero named styles, then writes
            // an invalid empty cellStyles element on SaveAs. A named style is
            // required by OOXML even when no cell explicitly uses it.
            stage = "подготовка формата общей таблицы";
            if (Path.GetExtension(source).ToLowerInvariant() is ".ods" or ".fods" && (int)_book.Styles.Count == 0) _book.Styles.Add("IVAN100");
            stage = "сохранение рабочей копии XLSX";
            _book.SaveAs(localPath, 51); // Common file format, no macros.
            stage = "подключение изменений";
            _changes = new LiveExcelChanges(_app);
        }
        catch (Exception error)
        {
            var message = WorkbookOpenFailure.AtStage("Excel", stage, error);
            AppLog.Error(message, error);
            try { if (_app is not null) _app.Quit(); }
            catch (Exception cleanup) { AppLog.Error("Could not close failed Excel startup", cleanup); }
            finally { Release(_book); Release(_app); }
            throw new InvalidOperationException(message, error);
        }
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
            var result = new JsonObject { ["content"] = content, ["fill"] = fill };
            var borders = _borders ? LiveWorkbookBorders.ReadExcel(sheet, address) : null; if (borders is not null) result["borders"] = borders; return result;
        }
        finally { Release(interior); Release(cell); }
    }
    private static void WriteCell(dynamic sheet, string address, string property, JsonNode? value)
    {
        dynamic cell = sheet.Range[address];
        try
        {
            if (property == "borders") LiveWorkbookBorders.WriteExcel(sheet, address, value);
            else if (property == "fill")
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

    private JsonObject CaptureView()
    {
        dynamic window = _app.ActiveWindow, sheet = _app.ActiveSheet, panes = window.Panes;
        try
        {
            var offsets = new JsonArray();
            for (int i = 1; i <= (int)panes.Count; i++)
            { dynamic pane = panes.Item[i]; try { offsets.Add(new JsonArray((int)pane.ScrollRow, (int)pane.ScrollColumn)); } finally { Release(pane); } }
            return new() { ["sheet"] = (string)sheet.Name, ["zoom"] = Convert.ToInt32(window.Zoom), ["panes"] = offsets };
        }
        finally { Release(panes); Release(sheet); Release(window); }
    }
    private void RestoreView(JsonObject state)
    {
        dynamic window = _app.ActiveWindow, active = _app.ActiveSheet;
        try
        {
            if ((string)active.Name != state["sheet"]!.GetValue<string>())
            {
                dynamic? sheet = null;
                try { sheet = Sheet(state["sheet"]!.GetValue<string>()); sheet.Activate(); }
                catch (COMException) { /* The user's original sheet may have been deleted. */ }
                finally { Release(sheet); }
            }
            if (Convert.ToInt32(window.Zoom) != state["zoom"]!.GetValue<int>()) window.Zoom = state["zoom"]!.GetValue<int>();
            dynamic panes = window.Panes;
            try
            {
                var offsets = state["panes"]!.AsArray();
                for (int i = 1; i <= Math.Min((int)panes.Count, offsets.Count); i++)
                {
                    dynamic pane = panes.Item[i];
                    try { if ((int)pane.ScrollRow != offsets[i-1]![0]!.GetValue<int>()) pane.ScrollRow = offsets[i-1]![0]!.GetValue<int>(); if ((int)pane.ScrollColumn != offsets[i-1]![1]!.GetValue<int>()) pane.ScrollColumn = offsets[i-1]![1]!.GetValue<int>(); }
                    finally { Release(pane); }
                }
            }
            finally { Release(panes); }
        }
        finally { Release(active); Release(window); }
    }
    public object Execute(JsonObject command)
    {
        bool preserve = command["type"]!.GetValue<string>() is "snapshot" or "save" or "apply" or "replace" or "filters";
        var view = preserve ? CaptureView() : null;
        try { return ExecuteCore(command); }
        finally { if (view is not null) RestoreView(view); }
    }
    private object ExecuteCore(JsonObject command)
    {
        switch (command["type"]!.GetValue<string>())
        {
            case "read-cell":
                dynamic readSheet=Sheet(command["sheetName"]!.GetValue<string>()); try { return new { cell=ReadCell(readSheet,command["address"]!.GetValue<string>()) }; } finally { Release(readSheet); }
            case "pulse":
                var pulse = Pulse(command["peers"] as JsonArray ?? []);
                var edits = _changes.CellsSince(command["sinceSerial"]?.GetValue<long>() ?? -1)?.ToArray();
                if (edits is { Length: > 0 })
                {
                    var cells = new JsonArray();
                    foreach (var edit in (_borders ? edits.SelectMany(edit => { var (col,row)=LiveWorkbookBorders.Position(edit.Address); return new (string Sheet,string Address)[]{edit,(edit.Sheet,LiveWorkbookBorders.Address(Math.Max(1,col-1),row)),(edit.Sheet,LiveWorkbookBorders.Address(col,Math.Max(1,row-1)))}; }).Distinct() : edits))
                    { dynamic sheet = Sheet(edit.Sheet); try { cells.Add(new JsonObject { ["sheetName"] = edit.Sheet, ["address"] = edit.Address, ["value"] = ReadCell(sheet, edit.Address) }); } finally { Release(sheet); } }
                    pulse["cells"] = cells;
                }
                return pulse;
            case "viewport":
                dynamic viewport = _app.ActiveWindow;
                try { return new { row = (int)viewport.ScrollRow - 1, column = (int)viewport.ScrollColumn - 1, zoom = Convert.ToInt32(viewport.Zoom) }; }
                finally { Release(viewport); }
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
            case "fixture-busy": throw new COMException("Excel is temporarily busy", unchecked((int)0x800AC472));
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
                Replace(command["book"]!.AsObject(), command["previous"] as JsonObject); return new { replaced = true };
            case "filter":
                dynamic filterSheet = Sheet(command["sheetName"]!.GetValue<string>());
                try { ApplyFilter(filterSheet, command["filter"] as JsonObject); }
                finally { Release(filterSheet); }
                return new { filtered = true };
            case "filters":
                foreach (var item in command["filters"]!.AsArray())
                { dynamic sheet = Sheet(item!["sheetName"]!.GetValue<string>()); try { ApplyFilter(sheet, item["value"] as JsonObject); } finally { Release(sheet); } }
                return new { filtered = true };
            case "sort":
                dynamic sortSheet = Sheet(command["sheetName"]!.GetValue<string>()), sortRange = sortSheet.Range[command["range"]!.GetValue<string>()];
                dynamic sortKey = sortRange.Columns[command["column"]!.GetValue<int>() + 1];
                try { sortRange.Sort(Key1: sortKey, Order1: command["ascending"]?.GetValue<bool>() == false ? 2 : 1, Header: command["header"]?.GetValue<bool>() == false ? 2 : 1); }
                finally { Release(sortKey); Release(sortRange); Release(sortSheet); }
                return new { sorted = true };
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
            case "load-filter-data":
                dynamic filterDataSheet = Sheet(command["sheetName"]!.GetValue<string>());
                int filterCount = command["count"]!.GetValue<int>();
                dynamic filterDataRange = filterDataSheet.Range["AF1:AH" + (filterCount + 1)];
                try
                {
                    var values = new object[filterCount + 1, 3]; values[0,0] = "Number"; values[0,1] = "Group"; values[0,2] = "Pair";
                    for (int i = 0; i < filterCount; i++) { values[i+1,0] = (double)(filterCount-i); values[i+1,1] = (double)(i%3); values[i+1,2] = (double)((filterCount-i)*10); }
                    filterDataRange.Value2 = values;
                }
                finally { Release(filterDataRange); Release(filterDataSheet); }
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
                            void Mark(dynamic native, JsonNode? draft = null)
                            {
                                Rectangle bounds = Rectangle.Intersect(clip, ScreenRectangle(pane, native));
                                if (bounds.Width > 0 && bounds.Height > 0) result["marks"]!.AsArray().Add(new JsonObject { ["bounds"] = new JsonArray(bounds.X, bounds.Y, bounds.Width, bounds.Height), ["name"] = peer["name"]!.DeepClone(), ["color"] = peer["color"]!.DeepClone(), ["draft"] = draft?.DeepClone() });
                            }
                            if (peer["draft"] is JsonObject draft && draft["sheetName"]!.GetValue<string>() == sheetName)
                            {
                                var cell = draft["cell"]!.AsArray(); dynamic native = sheet.Range[CellAddress(cell[0]!.GetValue<int>(), cell[1]!.GetValue<int>())];
                                try { Mark(native, draft["text"]); } finally { Release(native); }
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

    private void Replace(JsonObject book, JsonObject? previous)
    {
        var sheets = book["sheets"]!.AsArray();
        _app.EnableEvents = false; _app.ScreenUpdating = false;
        try
        {
            // Reuse sheets in order, preserving workbook formatting and charts
            // outside changed cells; temporary names avoid rename collisions.
            while ((int)_book.Worksheets.Count < sheets.Count) _book.Worksheets.Add(After: _book.Worksheets[_book.Worksheets.Count]);
            bool namesChanged = (int)_book.Worksheets.Count != sheets.Count;
            for (int index = 0; index < sheets.Count; index++)
            { dynamic sheet = _book.Worksheets[index + 1]; try { namesChanged |= (string)sheet.Name != sheets[index]!["name"]!.GetValue<string>(); } finally { Release(sheet); } }
            if (namesChanged) for (var index = 1; index <= (int)_book.Worksheets.Count; index++)
            { dynamic sheet = _book.Worksheets[index]; try { sheet.Name = "_iv_" + index + "_" + Guid.NewGuid().ToString("N")[..8]; } finally { Release(sheet); } }
            while ((int)_book.Worksheets.Count > sheets.Count) { dynamic last = _book.Worksheets[_book.Worksheets.Count]; try { last.Delete(); } finally { Release(last); } }
            for (var index = 0; index < sheets.Count; index++)
            {
                dynamic sheet = _book.Worksheets[index + 1];
                try
                {
                    if ((string)sheet.Name != sheets[index]!["name"]!.GetValue<string>()) sheet.Name = sheets[index]!["name"]!.GetValue<string>(); dynamic used = sheet.UsedRange;
                    try
                    {
                        // Never apply a fill to UsedRange: changing row visibility
                        // can extend it to all 16,384 columns. Formatting that
                        // rectangle materializes millions of empty XLSX cells.
                        foreach (int kind in new[] { 2, -4123 })
                        {
                            dynamic? populated = null;
                            try { populated = used.SpecialCells(kind); populated.ClearContents(); }
                            catch (COMException error) when (error.HResult == unchecked((int)0x800A03EC)) { /* No cells of this kind. */ }
                            finally { Release(populated); }
                        }
                        var priorSheet = previous?["sheets"]?.AsArray().ElementAtOrDefault(index);
                        foreach (var oldBorder in priorSheet?["cells"]?.AsObject().Where(cell => cell.Value!["borders"] is not null) ?? []) WriteCell(sheet, oldBorder.Key, "borders", null);
                        foreach (var oldCell in priorSheet?["cells"]?.AsObject().Where(cell => cell.Value!["fill"] is not null) ?? []) WriteCell(sheet, oldCell.Key, "fill", null);
                    }
                    finally { Release(used); }
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
                    foreach (var entry in cells.Where(cell => cell.Value!["borders"] is not null)) WriteCell(sheet, entry.Key, "borders", entry.Value!["borders"]);
                    ApplyFilter(sheet, source["filter"] as JsonObject);
                }
                finally { Release(sheet); }
            }
        }
        finally { _app.EnableEvents = true; _app.ScreenUpdating = !_hidden; }
    }
    private static void ApplyFilter(dynamic sheet, JsonObject? state)
    {
        string step = "сброс прежнего фильтра";
        try
        {
        if ((bool)sheet.FilterMode) sheet.ShowAllData();
        sheet.AutoFilterMode = false;
        dynamic used = sheet.UsedRange, rows = used.EntireRow;
        try { if (rows.Hidden is not bool allVisible || allVisible) rows.Hidden = false; } finally { Release(rows); Release(used); }
        if (state is null) return;
        if (state["range"] is not null)
        {
            step = "диапазон " + state["range"]!.GetValue<string>();
            dynamic range = sheet.Range[state["range"]!.GetValue<string>()];
            try
            {
                range.AutoFilter();
                foreach (var column in state["columns"]!.AsArray())
                {
                    int field = column!["column"]!.GetValue<int>() + 1; var tests = column["tests"]!.AsArray();
                    step = "условие столбца " + field;
                    if (tests.All(test => test!["operator"]!.GetValue<string>() == "equal") && column["and"]?.GetValue<bool>() != true)
                    {
                        object[] values = tests.Select(test => (object)(test!["value"]!.GetValue<string>() is "" ? "=" : test["value"]!.GetValue<string>())).ToArray();
                        range.AutoFilter(Field: field, Criteria1: values, Operator: 7);
                    }
                    else
                    {
                        string Criterion(JsonNode test) => (test["operator"]!.GetValue<string>() switch { "equal" => "=", "notEqual" => "<>", "lessThan" => "<", "lessThanOrEqual" => "<=", "greaterThan" => ">", "greaterThanOrEqual" => ">=", _ => throw new FormatException("Неизвестное условие фильтра") }) + test["value"]!.GetValue<string>();
                        if (tests.Count > 2) throw new FormatException("Слишком много условий фильтра");
                        if (tests.Count == 1) range.AutoFilter(Field: field, Criteria1: Criterion(tests[0]!));
                        else range.AutoFilter(Field: field, Criteria1: Criterion(tests[0]!), Operator: column["and"]!.GetValue<bool>() ? 1 : 2, Criteria2: Criterion(tests[1]!));
                    }
                }
            }
            finally { Release(range); }
        }
        // Native filtering has already applied its own row mask. Explicit
        // visibility without criteria represents manually hidden source rows.
        foreach (var pair in state["columns"]!.AsArray().Count == 0 ? state["hiddenRows"]!.AsArray() : new JsonArray())
        {
            step = "скрытые строки";
            dynamic range = sheet.Range[$"{pair![0]!.GetValue<int>()}:{pair[1]!.GetValue<int>()}"];
            try { range.Hidden = true; } finally { Release(range); }
        }
        }
        catch (COMException error) { throw new InvalidOperationException("Excel не применил фильтр: " + step + ". " + error.Message, error); }
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
    private bool IsClosed() { try { return (int)_book.Windows.Count == 0; } catch (Exception error) when (OfficeBusyErrors.IsTemporary(error)) { return false; } catch { return true; } }
    public static int Run(string[] args)
    {
        string Argument(string name) { var index = Array.IndexOf(args, name); if (index < 0 || index + 1 >= args.Length) throw new FormatException("Missing bridge argument"); return args[index + 1]; }
        try
        {
            using var bridge = new LiveExcelBridge(Argument("--file"), Argument("--local"), args.Contains("--hidden"), args.Contains("--borders"));
            Console.WriteLine("{\"ready\":true}"); string? line;
            while (true)
            {
                var inputLine = Task.Run(Console.ReadLine);
                while (!inputLine.IsCompleted) { Application.DoEvents(); Thread.Sleep(5); }
                line = inputLine.GetAwaiter().GetResult(); if (line is null) break;
                var input = JsonNode.Parse(line)!.AsObject(); if (input["type"]!.GetValue<string>() == "close") break;
                try { Console.WriteLine(JsonSerializer.Serialize(new { id = input["id"]!.GetValue<int>(), result = bridge.Execute(input) })); }
                catch (Exception error) { bool busy = OfficeBusyErrors.IsTemporary(error); Console.WriteLine(JsonSerializer.Serialize(new { id = input["id"]!.GetValue<int>(), error = error.Message, closed = !busy && bridge.IsClosed(), busy })); }
            }
            return 0;
        }
        catch (Exception error) { Console.WriteLine(JsonSerializer.Serialize(new { startupError = error.Message })); return 1; }
    }
}

using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Xml;
using System.Xml.Linq;

namespace IvanEge.WorkbookHelper;

// Local OOXML snapshots avoid hundreds of thousands of individual COM calls.
// Cached formula results are deliberately excluded: the office engine calculates.
internal sealed class LiveWorkbookBook
{
    private static readonly XNamespace S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static readonly XNamespace R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private readonly Dictionary<string, string> _identities = [];
    private readonly Dictionary<string, string> _names = [];
    public IReadOnlyDictionary<string, string> SheetNames => _names;
    public void UseNames(JsonObject book)
    {
        _names.Clear();
        foreach (var sheet in book["sheets"]!.AsArray()) _names[sheet!["id"]!.GetValue<string>()] = sheet["name"]!.GetValue<string>();
    }
    private static XDocument? Read(ZipArchive archive, string name)
    {
        var entry = archive.GetEntry(name); if (entry is null) return null;
        if (entry.Length > 80 * 1024 * 1024) throw new FormatException("Лист слишком велик для совместного режима");
        using var stream = entry.Open(); using var reader = XmlReader.Create(stream, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 80 * 1024 * 1024 });
        return XDocument.Load(reader);
    }
    public JsonObject Read(string file)
    {
        using var archive = ZipFile.OpenRead(file);
        if (archive.Entries.Sum(entry => entry.Length) > 256L * 1024 * 1024) throw new FormatException("Слишком большая распакованная книга");
        var workbook = Read(archive, "xl/workbook.xml") ?? throw new FormatException("Некорректная книга XLSX");
        if (archive.Entries.Any(entry => entry.FullName.StartsWith("xl/externalLinks/", StringComparison.OrdinalIgnoreCase))) throw new FormatException("Сначала удалите внешние связи из таблицы");
        var relationships = Read(archive, "xl/_rels/workbook.xml.rels")!;
        var links = relationships.Root!.Elements().ToDictionary(element => (string)element.Attribute("Id")!, element => (string)element.Attribute("Target")!);
        var strings = Read(archive, "xl/sharedStrings.xml")?.Root?.Elements(S + "si").Select(item => string.Concat(item.Descendants(S + "t").Select(text => text.Value))).ToArray() ?? [];
        var styles = Read(archive, "xl/styles.xml");
        var scheme = Read(archive, "xl/theme/theme1.xml")?.Descendants().FirstOrDefault(el => el.Name.LocalName == "clrScheme");
        var indexed = styles?.Root?.Element(S + "colors")?.Element(S + "indexedColors")?.Elements().Select(el => (string)el.Attribute("rgb")!).ToArray();
        var fills = styles?.Root?.Element(S + "fills")?.Elements(S + "fill").Select(fill => LiveWorkbookXml.Fill(fill, scheme, indexed)).ToArray() ?? [null];
        var fillIds = styles?.Root?.Element(S + "cellXfs")?.Elements(S + "xf").Select(style => (int?)style.Attribute("fillId") ?? 0).ToArray() ?? [0];
        var output = new JsonArray(); var count = 0; var currentNames = new Dictionary<string, string>();
        foreach (var sheet in workbook.Root!.Element(S + "sheets")!.Elements(S + "sheet"))
        {
            var name = (string)sheet.Attribute("name")!; var internalId = (string)sheet.Attribute("sheetId")!;
            var id = _names.FirstOrDefault(item => item.Value == name).Key;
            if (id is null && !_identities.TryGetValue(internalId, out id)) id = "sheet" + internalId;
            if (currentNames.ContainsKey(id)) id = "sheet" + Guid.NewGuid().ToString("N");
            _identities[internalId] = id; currentNames[id] = name;
            var target = links[(string)sheet.Attribute(R + "id")!].Replace('\\', '/');
            var entryName = target.StartsWith('/') ? target.TrimStart('/') : "xl/" + target;
            if (entryName.Contains("..", StringComparison.Ordinal)) throw new FormatException("Некорректный путь листа");
            var document = Read(archive, entryName) ?? throw new FormatException("Не найден лист");
            var shared = document.Descendants(S + "c").Where(cell => cell.Element(S + "f") is XElement f && f.Attribute("si") is not null && f.Value.Length > 0)
                .ToDictionary(cell => (string)cell.Element(S + "f")!.Attribute("si")!, cell => (Address: (string)cell.Attribute("r")!, Formula: cell.Element(S + "f")!.Value));
            var cells = new JsonObject();
            foreach (var cell in document.Descendants(S + "c"))
            {
                var address = (string)cell.Attribute("r")!; var kind = (string?)cell.Attribute("t");
                var raw = cell.Element(S + "v")?.Value; var formula = cell.Element(S + "f");
                JsonObject content = new() { ["kind"] = "empty" };
                if (formula is not null)
                {
                    if ((string?)formula.Attribute("t") is "array" or "dataTable") throw new FormatException("Массивные формулы и таблицы данных требуют обычного режима");
                    string expression = formula.Value;
                    if ((string?)formula.Attribute("si") is string si)
                    { if (!shared.TryGetValue(si, out var master)) throw new FormatException("Не найдена исходная формула диапазона"); expression = LiveWorkbookXml.ShiftFormula(master.Formula, master.Address, address); }
                    // Calc represents Boolean constants as zero-argument formulas.
                    string normalized = expression.Replace("_xlfn.", "", StringComparison.Ordinal);
                    content = normalized is "TRUE()" or "FALSE()" ? new() { ["kind"] = "boolean", ["value"] = normalized == "TRUE()" } : new() { ["kind"] = "formula", ["value"] = "=" + normalized };
                }
                else if (kind == "s" && int.TryParse(raw, out var stringIndex)) content = new() { ["kind"] = "text", ["value"] = strings[stringIndex] };
                else if (kind == "inlineStr") content = new() { ["kind"] = "text", ["value"] = string.Concat(cell.Element(S + "is")?.Descendants(S + "t").Select(text => text.Value) ?? []) };
                else if (kind == "str") content = new() { ["kind"] = "text", ["value"] = raw ?? "" };
                else if (kind == "b") content = new() { ["kind"] = "boolean", ["value"] = raw == "1" };
                else if (kind == "e") throw new FormatException($"В ячейке {name}!{address} ошибка без формулы. Исправьте её перед подключением.");
                else if (!string.IsNullOrEmpty(raw) && double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var number)) content = new() { ["kind"] = "number", ["value"] = number };
                var styleIndex = (int?)cell.Attribute("s") ?? 0;
                var fillIndex = styleIndex < fillIds.Length ? fillIds[styleIndex] : 0;
                int? fill = fillIndex < fills.Length ? fills[fillIndex] : null;
                if (content["kind"]!.GetValue<string>() == "empty" && fill is null) continue;
                if (++count > 250000) throw new FormatException("В совместном режиме допускается до 250 000 заполненных ячеек");
                cells[address] = new JsonObject { ["content"] = content, ["fill"] = fill };
            }
            var result = new JsonObject { ["id"] = id, ["name"] = name, ["cells"] = cells };
            var filter = LiveWorkbookFilter.Read(document);
            if (filter is not null) result["filter"] = filter;
            output.Add(result);
        }
        _names.Clear(); foreach (var item in currentNames) _names[item.Key] = item.Value;
        if (output.Count is < 1 or > 16) throw new FormatException("Для совместного режима нужна книга от 1 до 16 листов");
        return new JsonObject { ["sheets"] = output };
    }
    public static JsonObject EmptyCell() => new() { ["content"] = new JsonObject { ["kind"] = "empty" }, ["fill"] = null };
    public static string Digest(JsonNode value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value.ToJsonString()))).ToLowerInvariant();
    public static JsonArray Differences(JsonObject before, JsonObject after, JsonObject versions, long structureRevision)
    {
        var changes = new JsonArray();
        var previous = before["sheets"]!.AsArray().ToDictionary(sheet => sheet!["id"]!.GetValue<string>(), sheet => sheet!);
        foreach (var sheet in after["sheets"]!.AsArray())
        {
            var id = sheet!["id"]!.GetValue<string>(); if (!previous.TryGetValue(id, out var old)) continue;
            var cells = sheet["cells"]!.AsObject(); var oldCells = old["cells"]!.AsObject();
            foreach (var address in cells.Select(item => item.Key).Union(oldCells.Select(item => item.Key)))
                foreach (var property in new[] { "content", "fill" })
                {
                    var value = (cells[address] ?? EmptyCell())[property]; var prior = (oldCells[address] ?? EmptyCell())[property];
                    if (JsonNode.DeepEquals(value, prior)) continue;
                    changes.Add(new JsonObject { ["sheetId"] = id, ["address"] = address, ["property"] = property, ["value"] = value?.DeepClone(), ["baseVersion"] = versions[$"{id}/{address}/{property}"]?.GetValue<long>() ?? structureRevision });
                }
        }
        return changes;
    }
    public static JsonArray Differences(JsonObject before, JsonObject after, JsonObject versions, long structureRevision,
        IReadOnlyCollection<(string Sheet, string Address, string Property)> touched)
    {
        var changes = new JsonArray();
        var previous = before["sheets"]!.AsArray().ToDictionary(sheet => sheet!["id"]!.GetValue<string>(), sheet => sheet!);
        var current = after["sheets"]!.AsArray().ToDictionary(sheet => sheet!["id"]!.GetValue<string>(), sheet => sheet!);
        foreach (var (id, address, property) in touched)
        {
            if (!previous.TryGetValue(id, out var old) || !current.TryGetValue(id, out var sheet)) continue;
            var value = (sheet["cells"]![address] ?? EmptyCell())[property]; var prior = (old["cells"]![address] ?? EmptyCell())[property];
            if (JsonNode.DeepEquals(value, prior)) continue;
            changes.Add(new JsonObject { ["sheetId"] = id, ["address"] = address, ["property"] = property, ["value"] = value?.DeepClone(), ["baseVersion"] = versions[$"{id}/{address}/{property}"]?.GetValue<long>() ?? structureRevision });
        }
        return changes;
    }
    public static bool Structural(JsonObject before, JsonObject after, JsonArray changes)
    {
        if (!SameSheets(before, after)) return true;
        var oldFilters = before["sheets"]!.AsArray().ToDictionary(sheet => sheet!["id"]!.GetValue<string>(), sheet => sheet!["filter"]);
        if (after["sheets"]!.AsArray().Any(sheet => !JsonNode.DeepEquals(oldFilters[sheet!["id"]!.GetValue<string>()], sheet["filter"]))) return true;
        var sheets = before["sheets"]!.AsArray().ToDictionary(sheet => sheet!["id"]!.GetValue<string>(), sheet => sheet!["cells"]!.AsObject());
        var prior = new HashSet<string>(); var next = new HashSet<string>();
        foreach (var change in changes)
        {
            if (change!["property"]!.GetValue<string>() != "content") continue;
            var old = (sheets[change["sheetId"]!.GetValue<string>()][change["address"]!.GetValue<string>()] ?? EmptyCell())["content"]!;
            if (old["kind"]!.GetValue<string>() != "empty") prior.Add(old.ToJsonString());
            if (change["value"]!["kind"]!.GetValue<string>() != "empty") next.Add(change["value"]!.ToJsonString());
        }
        return changes.Count > 1 && prior.Overlaps(next);
    }
    public static bool SameSheets(JsonObject before, JsonObject after) =>
        before["sheets"]!.AsArray().Select(sheet => sheet!["id"] + "/" + sheet["name"]).SequenceEqual(
            after["sheets"]!.AsArray().Select(sheet => sheet!["id"] + "/" + sheet["name"]));
}

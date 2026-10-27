using System.Text.Json.Nodes;
using System.Xml.Linq;

namespace IvanEge.WorkbookHelper;

// Only document state is shared. Sheet views, zoom, selection and scroll offsets
// deliberately never enter the network model.
internal static class LiveWorkbookFilter
{
    private static readonly XNamespace S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    public static JsonObject? Read(XDocument sheet)
    {
        var hidden = new JsonArray(); int start = -1, end = -1;
        foreach (var row in sheet.Root!.Element(S + "sheetData")?.Elements(S + "row") ?? [])
        {
            if ((string?)row.Attribute("hidden") is not ("1" or "true")) continue;
            int number = (int)row.Attribute("r")!;
            if (number == end + 1) end = number;
            else { if (start > 0) hidden.Add(new JsonArray(start, end)); start = end = number; }
        }
        if (start > 0) hidden.Add(new JsonArray(start, end));
        var source = sheet.Root.Element(S + "autoFilter");
        if (source is null && hidden.Count == 0) return null;
        var columns = new JsonArray();
        foreach (var column in source?.Elements(S + "filterColumn") ?? [])
        {
            var tests = new JsonArray(); bool conjunction = false;
            if (column.Element(S + "filters") is XElement values)
            {
                foreach (var value in values.Elements(S + "filter")) tests.Add(new JsonObject { ["operator"] = "equal", ["value"] = (string?)value.Attribute("val") ?? "" });
                if ((string?)values.Attribute("blank") is "1" or "true") tests.Add(new JsonObject { ["operator"] = "equal", ["value"] = "" });
                if (values.Elements(S + "dateGroupItem").Any()) throw new FormatException("Групповой фильтр дат пока не поддерживается в общей таблице");
            }
            else if (column.Element(S + "customFilters") is XElement custom)
            {
                conjunction = (string?)custom.Attribute("and") is "1" or "true";
                foreach (var value in custom.Elements(S + "customFilter")) tests.Add(new JsonObject { ["operator"] = (string?)value.Attribute("operator") ?? "equal", ["value"] = (string?)value.Attribute("val") ?? "" });
            }
            else if (column.Elements().Any()) throw new FormatException("Этот вид фильтра пока не поддерживается в общей таблице. Используйте фильтр значений или числовое условие.");
            if (tests.Count == 0) continue;
            // A single predicate has the same meaning in Excel's filters and
            // Calc's customFilters; normalize ordering to avoid echo loops.
            var ordered = new JsonArray(tests.OrderBy(item => item!["operator"]!.GetValue<string>(), StringComparer.Ordinal).ThenBy(item => item!["value"]!.GetValue<string>(), StringComparer.Ordinal).Select(item => item!.DeepClone()).ToArray());
            columns.Add(new JsonObject { ["column"] = (int)column.Attribute("colId")!, ["and"] = tests.Count > 1 && conjunction, ["tests"] = ordered });
        }
        string? range = ((string?)source?.Attribute("ref"))?.Replace("$", "");
        if (range is not null && !range.Contains(':')) range += ":" + range;
        return new JsonObject { ["range"] = range, ["columns"] = new JsonArray(columns.OrderBy(item => item!["column"]!.GetValue<int>()).Select(item => item!.DeepClone()).ToArray()), ["hiddenRows"] = hidden };
    }
}

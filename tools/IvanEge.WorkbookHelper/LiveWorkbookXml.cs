using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace IvanEge.WorkbookHelper;

internal static class LiveWorkbookXml
{
    // OOXML shared formula references obey the same relative/absolute rules as
    // native fill-down. Quoted literals, sheet names and structured references
    // are tokens of their own and must never be rewritten as cell addresses.
    private static readonly Regex Tokens = new("\"(?:[^\"]|\"\")*\"|'(?:[^']|'')*'|\\[[^\\]]*\\]|(?<![A-Za-z0-9_.$])(?<cell>\\$?[A-Z]{1,3}\\$?[1-9][0-9]*)(?![A-Za-z0-9_!(])|(?<![A-Za-z0-9_.$])(?<columns>\\$?[A-Z]{1,3}:\\$?[A-Z]{1,3})(?![A-Za-z0-9_!])|(?<![A-Za-z0-9_.$])(?<rows>\\$?[1-9][0-9]*:\\$?[1-9][0-9]*)(?![A-Za-z0-9_!])", RegexOptions.CultureInvariant);
    private static (int Column, int Row) Address(string value)
    {
        int column = 0, index = 0;
        foreach (char ch in value) { if (!char.IsAsciiLetterUpper(ch)) break; column = column * 26 + ch - 'A' + 1; index++; }
        return (column, int.Parse(value[index..], CultureInfo.InvariantCulture));
    }
    private static string Letters(int column)
    {
        string result = ""; while (column > 0) { column--; result = (char)('A' + column % 26) + result; column /= 26; } return result;
    }
    public static string ShiftFormula(string formula, string source, string target)
    {
        var from = Address(source); var to = Address(target); int dx = to.Column - from.Column, dy = to.Row - from.Row;
        string Shift(string value, bool columns)
        {
            if (value.StartsWith('$')) return value;
            int number = columns ? Address(value + "1").Column + dx : int.Parse(value, CultureInfo.InvariantCulture) + dy;
            if (number < 1 || number > (columns ? 16384 : 1048576)) return "#REF!";
            return columns ? Letters(number) : number.ToString(CultureInfo.InvariantCulture);
        }
        return Tokens.Replace(formula, match =>
        {
            if (match.Groups["columns"].Success) return string.Join(':', match.Value.Split(':').Select(value => Shift(value, true)));
            if (match.Groups["rows"].Success) return string.Join(':', match.Value.Split(':').Select(value => Shift(value, false)));
            if (!match.Groups["cell"].Success) return match.Value;
            var parts = Regex.Match(match.Value, "^(\\$?[A-Z]+)(\\$?[0-9]+)$");
            var col = Shift(parts.Groups[1].Value, true); var row = Shift(parts.Groups[2].Value, false);
            return col == "#REF!" || row == "#REF!" ? "#REF!" : col + row;
        });
    }

    private static readonly string[] Palette = ("000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF " +
        "000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 800000 008000 000080 808000 800080 008080 C0C0C0 808080 " +
        "9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCCC 000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF " +
        "00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 " +
        "003366 339966 003300 333300 993300 993366 333399 333333").Split(' ');
    public static int? Fill(XElement fill, XElement? scheme, string[]? indexed)
    {
        XNamespace s = fill.Name.Namespace;
        if (fill.Element(s + "gradientFill") is not null) throw new FormatException("Для градиентной заливки используйте обычный режим таблицы");
        var pattern = fill.Element(s + "patternFill"); if ((string?)pattern?.Attribute("patternType") is null or "none" or "gray125") return null;
        if ((string?)pattern.Attribute("patternType") != "solid") throw new FormatException("Для узорной заливки используйте обычный режим таблицы");
        var color = pattern.Element(s + "fgColor") ?? throw new FormatException("Не указан цвет заливки");
        string? rgb = (string?)color.Attribute("rgb");
        if (int.TryParse((string?)color.Attribute("theme"), out int theme))
        {
            string[] names = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
            var node = theme >= 0 && theme < names.Length ? scheme?.Elements().FirstOrDefault(el => el.Name.LocalName == names[theme])?.Elements().FirstOrDefault() : null;
            rgb = (string?)node?.Attribute("val"); if (node?.Name.LocalName == "sysClr") rgb = (string?)node.Attribute("lastClr");
        }
        else if (int.TryParse((string?)color.Attribute("indexed"), out int index)) rgb = index == 64 ? "000000" : index == 65 ? "FFFFFF" : index >= 0 && index < (indexed?.Length ?? Palette.Length) ? (indexed ?? Palette)[index] : null;
        if (rgb is null && (string?)color.Attribute("auto") is "1" or "true") rgb = "000000";
        if (rgb is null || rgb.Length < 6) throw new FormatException("Не удалось определить цвет заливки");
        int value = int.Parse(rgb[^6..], NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        if (!double.TryParse((string?)color.Attribute("tint"), NumberStyles.Float, CultureInfo.InvariantCulture, out double tint) || tint == 0) return value;
        // ISO 29500 foregroundColor tint: adjust HLS luminosity, not RGB.
        var source = System.Drawing.Color.FromArgb(value >> 16 & 255, value >> 8 & 255, value & 255);
        double light = source.GetBrightness(), saturation = source.GetSaturation(), hue = source.GetHue() / 360.0;
        light = tint < 0 ? light * (1 + tint) : light * (1 - tint) + tint;
        double upper = light < .5 ? light * (1 + saturation) : light + saturation - light * saturation, lower = 2 * light - upper;
        int Channel(double h)
        {
            h = (h + 1) % 1; double c = saturation == 0 ? light : h < 1.0 / 6 ? lower + (upper - lower) * 6 * h : h < .5 ? upper : h < 2.0 / 3 ? lower + (upper - lower) * (2.0 / 3 - h) * 6 : lower;
            return Math.Clamp((int)Math.Round(c * 255), 0, 255);
        }
        return Channel(hue + 1.0 / 3) << 16 | Channel(hue) << 8 | Channel(hue - 1.0 / 3);
    }
}

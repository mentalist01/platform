using System.Text;

namespace IvanEge.WorkbookHelper;

internal static class MarkOfTheWeb
{
    private static readonly HashSet<string> MacroCapableExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".xls", ".xlsm", ".xlsb"
    };

    public static bool TryApplyAndVerify(string filePath, Uri origin)
    {
        try
        {
            var streamPath = filePath + ":Zone.Identifier";
            var expected = BuildContent(origin);
            using (var stream = new FileStream(
                streamPath,
                FileMode.Create,
                FileAccess.Write,
                FileShare.None,
                4096,
                FileOptions.WriteThrough))
            using (var writer = new StreamWriter(stream, new UTF8Encoding(false), 4096, leaveOpen: true))
            {
                writer.Write(expected);
                writer.Flush();
                stream.Flush(flushToDisk: true);
            }

            var actual = File.ReadAllText(streamPath, Encoding.UTF8);
            if (!string.Equals(actual, expected, StringComparison.Ordinal))
            {
                throw new InvalidDataException("Zone.Identifier verification did not match the written value.");
            }
            return true;
        }
        catch (Exception error)
        {
            AppLog.Error("Could not write Mark-of-the-Web Zone.Identifier", error);
            return false;
        }
    }

    public static bool IsMacroCapableFileName(string fileName) =>
        MacroCapableExtensions.Contains(Path.GetExtension(fileName));

    internal static string BuildContent(Uri origin)
    {
        var safeOrigin = ProtocolRequestParser.NormalizeAndValidateOrigin(
            origin.GetLeftPart(UriPartial.Authority)).GetLeftPart(UriPartial.Authority);
        return $"[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl={safeOrigin}\r\nHostUrl={safeOrigin}\r\n";
    }
}

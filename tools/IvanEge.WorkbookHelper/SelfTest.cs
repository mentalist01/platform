using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.IO.Compression;
using System.Xml.Linq;

namespace IvanEge.WorkbookHelper;

internal static class SelfTest
{
    public static string ReportPath => Path.Combine(Path.GetTempPath(), "IvanEgeWorkbookHelper-selftest.txt");

    public static int Run()
    {
        var temporaryDirectory = Path.Combine(Path.GetTempPath(), $"IvanEgeWorkbookHelper-test-{Guid.NewGuid():N}");
        try
        {
            Directory.CreateDirectory(temporaryDirectory);
            TestProtocolParsing();
            TestFileNames(temporaryDirectory);
            TestSaveAsCandidateRules(temporaryDirectory);
            TestStaleDownloadCleanup(temporaryDirectory);
            TestTrustStore(temporaryDirectory);
            TestBuiltInTrustPolicy();
            TestMarkOfTheWeb(temporaryDirectory);
            TestPackageIdentity();
            TestInstallerFallback();
            TestSessionKeys();
            TestSolutionNamingContract();
            TestStableSnapshot(temporaryDirectory).GetAwaiter().GetResult();
            TestFlatWorkbookSnapshot(temporaryDirectory).GetAwaiter().GetResult();
            TestHashValidation();
            TestLiveWorkbookXml();
            TryDelete(ReportPath);
            return 0;
        }
        catch (Exception error)
        {
            File.WriteAllText(ReportPath, error.ToString(), Encoding.UTF8);
            return 1;
        }
        finally
        {
            try
            {
                if (Directory.Exists(temporaryDirectory)) Directory.Delete(temporaryDirectory, true);
            }
            catch
            {
                // Test cleanup is best effort.
            }
        }
    }

    private static void TestProtocolParsing()
    {
        var first = ProtocolRequestParser.Parse(
            "ivan-ege://open?origin=https%3A%2F%2Fexample.ru&ticket=abcdefghijklmnop");
        Assert(first.Origin.GetLeftPart(UriPartial.Authority) == "https://example.ru", "HTTPS origin normalization failed");
        Assert(first.Ticket == "abcdefghijklmnop", "Ticket parsing failed");

        var second = ProtocolRequestParser.Parse(
            "ivan-ege://workbook/open?ticket=0123456789abcdef&origin=http%3A%2F%2Flocalhost%3A5175");
        Assert(second.Origin.Port == 5175 && second.Origin.IsLoopback, "Local development origin failed");

        AssertThrows<FormatException>(() => ProtocolRequestParser.Parse(
            "ivan-ege://open?origin=http%3A%2F%2Fevil.example&ticket=abcdefghijklmnop"));
        AssertThrows<FormatException>(() => ProtocolRequestParser.Parse(
            "ivan-ege://open?origin=https%3A%2F%2Fexample.ru&origin=https%3A%2F%2Fother.ru&ticket=abcdefghijklmnop"));
        AssertThrows<FormatException>(() => ProtocolRequestParser.Parse(
            "ivan-ege://delete?origin=https%3A%2F%2Fexample.ru&ticket=abcdefghijklmnop"));
    }

    private static void TestLiveWorkbookXml()
    {
        Assert(LiveWorkbookXml.ShiftFormula("SUM(A1,$B2,C$3,$D$4,'A1'!E5,\"A1\",LOG10(A1),A:A,2:2)", "C2", "D4") ==
            "SUM(B3,$B4,D$3,$D$4,'A1'!F7,\"A1\",LOG10(B3),B:B,4:4)", "Shared formulas must preserve quoted text and absolute references");
        Assert(LiveWorkbookXml.ShiftFormula("A1+$A$1", "B2", "A1") == "#REF!+$A$1", "Shared formula boundaries");
        XNamespace s = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        var solid = new XElement(s + "fill", new XElement(s + "patternFill", new XAttribute("patternType", "solid"), new XElement(s + "fgColor", new XAttribute("indexed", 5))));
        Assert(LiveWorkbookXml.Fill(solid, null, null) == 0xffff00, "Indexed fill palette");
        var color = solid.Descendants(s + "fgColor").Single(); color.RemoveAttributes(); color.SetAttributeValue("theme", 4); color.SetAttributeValue("tint", 1);
        var scheme = XElement.Parse("<clrScheme><accent1><srgbClr val='4472C4'/></accent1></clrScheme>");
        Assert(LiveWorkbookXml.Fill(solid, scheme, null) == 0xffffff, "Theme tint to white");
        color.SetAttributeValue("tint", -1); Assert(LiveWorkbookXml.Fill(solid, scheme, null) == 0, "Theme tint to black");
    }

    private static void TestPackageIdentity()
    {
        Assert(!PackageIdentity.IsPackaged, "Unpackaged self-test was incorrectly reported as MSIX-packaged");
    }

    private static void TestFileNames(string directory)
    {
        var sanitized = LocalWorkbookFiles.SanitizeFileName("CON.ods");
        Assert(sanitized == "_CON.ods", "Reserved Windows filename was not escaped");
        Assert(LocalWorkbookFiles.SanitizeFileName("macro.xlsm") == "macro.xlsm", "XLSM support failed");
        AssertThrows<FormatException>(() => LocalWorkbookFiles.SanitizeFileName("template.xlt"));
        AssertThrows<FormatException>(() => LocalWorkbookFiles.SanitizeFileName("template.xltx"));
        AssertThrows<FormatException>(() => LocalWorkbookFiles.SanitizeFileName("template.ots"));
        AssertThrows<FormatException>(() => LocalWorkbookFiles.SanitizeFileName("script.exe"));

        Assert(LocalSourceTextFiles.SanitizeFileName("26_1.txt") == "26_1.txt", "TXT support failed");
        Assert(LocalSourceTextFiles.SanitizeFileName("data.CSV") == "data.csv", "CSV support failed");
        Assert(LocalSourceTextFiles.SanitizeFileName("table.tsv") == "table.tsv", "TSV support failed");
        Assert(LocalSourceTextFiles.SanitizeFileName("CON.txt") == "_CON.txt", "Reserved text filename was not escaped");
        AssertThrows<FormatException>(() => LocalSourceTextFiles.SanitizeFileName("script.exe"));

        var first = LocalWorkbookFiles.GetUniquePath(directory, "Задание.ods");
        File.WriteAllText(first, "test");
        var second = LocalWorkbookFiles.GetUniquePath(directory, "Задание.ods");
        Assert(second.EndsWith("Задание (2).ods", StringComparison.Ordinal), "Unique filename suffix failed");
    }

    private static void TestStaleDownloadCleanup(string directory)
    {
        var stale = Path.Combine(directory, ".old.123.download");
        var fresh = Path.Combine(directory, ".fresh.456.download");
        File.WriteAllText(stale, "old");
        File.WriteAllText(fresh, "fresh");
        var now = DateTime.UtcNow;
        File.SetLastWriteTimeUtc(stale, now.AddDays(-2));
        File.SetLastWriteTimeUtc(fresh, now);
        var removed = AppPaths.CleanupStaleSolutionDownloads(directory, now);
        Assert(removed == 1 && !File.Exists(stale) && File.Exists(fresh), "Stale .download cleanup failed");
    }

    private static void TestSaveAsCandidateRules(string directory)
    {
        var current = Path.Combine(directory, "Задание.xlsx");
        var copy = Path.Combine(directory, "Задание готово.xlsx");
        Assert(LocalWorkbookFiles.IsSupportedWorkingFilePath(copy), "Saved workbook copy was rejected");
        Assert(LocalWorkbookFiles.IsPossibleSaveAsPath(current, copy), "Save As copy was not recognized");
        Assert(!LocalWorkbookFiles.IsPossibleSaveAsPath(current, current), "Original path was treated as Save As");
        Assert(!LocalWorkbookFiles.IsPossibleSaveAsPath(current, Path.Combine(directory, "~$Задание.xlsx")), "Office lock file was accepted");
        Assert(!LocalWorkbookFiles.IsPossibleSaveAsPath(current, Path.Combine(directory, "Задание.ods")), "Changed workbook format was accepted");
        Assert(!LocalWorkbookFiles.IsPossibleSaveAsPath(current, Path.Combine(directory, "sub", "Задание.xlsx")), "Workbook outside the watched directory was accepted");
    }

    private static void TestTrustStore(string directory)
    {
        var path = Path.Combine(directory, "trusted.json");
        var origin = new Uri("https://example.ru");
        var store = new OriginTrustStore(path);
        Assert(!store.IsTrusted(origin), "New trust store must be empty");
        store.Trust(origin);
        Assert(new OriginTrustStore(path).IsTrusted(origin), "Trusted origin was not persisted");
        store.Clear();
        Assert(!new OriginTrustStore(path).IsTrusted(origin), "Trust store clear failed");
    }

    private static void TestBuiltInTrustPolicy()
    {
        Assert(OriginTrustPolicy.IsBuiltInTrusted(new Uri("http://localhost:5175")), "Localhost was not auto-trusted");
        Assert(OriginTrustPolicy.IsBuiltInTrusted(new Uri("http://127.0.0.1:5175")), "IPv4 loopback was not auto-trusted");
        Assert(OriginTrustPolicy.IsBuiltInTrusted(new Uri("http://[::1]:5175")), "IPv6 loopback was not auto-trusted");
        Assert(OriginTrustPolicy.IsBuiltInTrusted(new Uri("https://ivan100.ru")), "Production origin was not auto-trusted");
        Assert(!OriginTrustPolicy.IsBuiltInTrusted(new Uri("https://www.ivan100.ru")), "Production subdomain was auto-trusted");
        Assert(!OriginTrustPolicy.IsBuiltInTrusted(new Uri("https://ivan100.ru.evil.example")), "Lookalike origin was auto-trusted");
        Assert(!OriginTrustPolicy.IsBuiltInTrusted(new Uri("https://example.ru")), "Unrelated HTTPS origin was auto-trusted");
    }

    private static async Task TestStableSnapshot(string directory)
    {
        var source = Path.Combine(directory, "stable.ods");
        var bytes = Encoding.UTF8.GetBytes("stable workbook bytes");
        await File.WriteAllBytesAsync(source, bytes);
        using var snapshot = await StableFileSnapshot.CaptureAsync(
            source,
            TimeSpan.FromSeconds(4),
            CancellationToken.None,
            directory);
        var expected = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        Assert(snapshot.ContentHash == expected, "Stable snapshot SHA-256 mismatch");
        Assert(snapshot.SizeBytes == bytes.Length, "Stable snapshot size mismatch");
        Assert(File.Exists(snapshot.Path), "Stable snapshot file is missing");
    }

    private static void TestHashValidation()
    {
        var valid = new string('a', 64);
        Assert(HelperApiClient.NormalizeHash(valid.ToUpperInvariant()) == valid, "SHA-256 normalization failed");
        Assert(HelperApiClient.NormalizeHash("not-a-hash") is null, "Invalid hash was accepted");
    }

    private static async Task TestFlatWorkbookSnapshot(string directory)
    {
        const string office = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
        const string table = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
        var source = Path.Combine(directory, "formula.fods");
        var xml = "<office:document xmlns:office=\""+office+"\" xmlns:table=\""+table+"\" xmlns:of=\"urn:oasis:names:tc:opendocument:xmlns:of:1.2\" xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\" office:mimetype=\""+FlatWorkbookPackage.Mime+"\" office:version=\"1.3\"><office:meta/><office:settings/><office:automatic-styles/><office:body><office:spreadsheet><table:table table:name=\"Лист1\"><table:table-row><table:table-cell table:formula=\"of:=SUM([.A1:.A3])\" office:value-type=\"float\" office:value=\"6\"><text:p>6</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document>";
        xml = xml.Replace("<table:table-row><table:table-cell table:formula=", "<table:table-row><table:table-cell office:value-type=\"float\" office:value=\"1\"><text:p>1</text:p></table:table-cell><table:table-cell table:formula=")
            .Replace("</table:table-row></table:table>", "</table:table-row><table:table-row><table:table-cell office:value-type=\"float\" office:value=\"2\"><text:p>2</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell office:value-type=\"float\" office:value=\"3\"><text:p>3</text:p></table:table-cell></table:table-row></table:table>");
        await File.WriteAllTextAsync(source, xml, new UTF8Encoding(false));
        var sourceHash = Convert.ToHexString(SHA256.HashData(await File.ReadAllBytesAsync(source))).ToLowerInvariant();
        using (var snapshot = await StableFileSnapshot.CaptureAsync(source, TimeSpan.FromSeconds(4), CancellationToken.None, directory))
        {
            Assert(snapshot.ContentHash == sourceHash, "Source hash must remain the duplicate-upload guard");
            Assert(snapshot.UploadExtension == ".ods", "FODS must upload as compressed ODS");
            Assert(snapshot.UploadContentHash != sourceHash, "Upload hash must describe the packaged bytes");
            using var archive = ZipFile.OpenRead(snapshot.Path);
            Assert(archive.Entries[0].FullName == "mimetype", "ODF MIME must be the first entry");
            using var stream = archive.GetEntry("content.xml")!.Open();
            var content = XDocument.Load(stream);
            var cell = content.Descendants(XName.Get("table-cell", table)).Single(c => c.Attribute(XName.Get("formula", table)) != null);
            Assert((string?)cell.Attribute(XName.Get("formula", table)) == "of:=SUM([.A1:.A3])", "Formula changed during packaging");
            Assert((string?)cell.Attribute(XName.Get("value", office)) == "6", "Cached value changed during packaging");
            Assert(cell.GetNamespaceOfPrefix("of")?.NamespaceName == "urn:oasis:names:tc:opendocument:xmlns:of:1.2", "Formula namespace lost");
            foreach(var name in new[]{"styles.xml","settings.xml","meta.xml","META-INF/manifest.xml"}) Assert(archive.GetEntry(name) != null, "Missing ODF part: "+name);
            var proof = Environment.GetEnvironmentVariable("IVAN_WORKBOOK_PACKAGE_PROOF");
            if (!string.IsNullOrWhiteSpace(proof)) File.Copy(snapshot.Path, proof, true);
        }
        Assert(await File.ReadAllTextAsync(source) == xml, "Packaging modified the user's open file");
        var huge = Path.Combine(directory, "large.fods");
        await using (var output = new StreamWriter(huge, false, new UTF8Encoding(false)))
        {
            var split = xml.IndexOf("<office:body>", StringComparison.Ordinal) + "<office:body>".Length;
            await output.WriteAsync(xml[..split]);
            var block = "<!--" + new string('x', 4096) + "-->";
            for(var i = 0; i < 16400; i++) await output.WriteAsync(block);
            await output.WriteAsync(xml[split..]);
        }
        Assert(new FileInfo(huge).Length > AppPaths.MaxWorkbookBytes, "Large fixture must exceed 64 MiB");
        using var packed = await StableFileSnapshot.CaptureAsync(huge, TimeSpan.FromSeconds(30), CancellationToken.None, directory);
        Assert(packed.SizeBytes < 1024*1024, "Repetitive flat XML was not compressed");
        var invalid = Path.Combine(directory, "invalid.fods");
        await File.WriteAllTextAsync(invalid, "<!DOCTYPE x [<!ENTITY test SYSTEM 'file:///private'>]><x>&test;</x>");
        await AssertThrowsAsync<HelperApiException>(() => StableFileSnapshot.CaptureAsync(invalid, TimeSpan.FromSeconds(4), CancellationToken.None, directory));
    }

    private static async Task AssertThrowsAsync<T>(Func<Task<StableFileSnapshot>> action) where T : Exception
    {
        try { using var value = await action(); } catch(T) { return; }
        throw new InvalidOperationException("Expected "+typeof(T).Name);
    }

    private static void TestMarkOfTheWeb(string directory)
    {
        var origin = new Uri("https://example.ru");
        var content = MarkOfTheWeb.BuildContent(origin);
        Assert(content.Contains("ZoneId=3", StringComparison.Ordinal), "MOTW ZoneId is missing");
        Assert(content.Contains("HostUrl=https://example.ru", StringComparison.Ordinal), "MOTW HostUrl is missing");
        Assert(content.Contains("ReferrerUrl=https://example.ru", StringComparison.Ordinal), "MOTW ReferrerUrl is missing");
        Assert(MarkOfTheWeb.IsMacroCapableFileName("legacy.xls"), "XLS must be treated as macro-capable");
        Assert(MarkOfTheWeb.IsMacroCapableFileName("macro.xlsm"), "XLSM must be treated as macro-capable");
        Assert(MarkOfTheWeb.IsMacroCapableFileName("binary.xlsb"), "XLSB must be treated as macro-capable");
        Assert(!MarkOfTheWeb.IsMacroCapableFileName("safe.xlsx"), "XLSX must not be treated as macro-capable");
        Assert(!MarkOfTheWeb.IsMacroCapableFileName("safe.ods"), "ODS must not be treated as macro-capable");

        var workbookPath = Path.Combine(directory, "motw.xlsx");
        File.WriteAllText(workbookPath, "workbook");
        Assert(MarkOfTheWeb.TryApplyAndVerify(workbookPath, origin), "MOTW write/read verification failed");
        Assert(
            File.ReadAllText(workbookPath + ":Zone.Identifier", Encoding.UTF8) == content,
            "Verified MOTW stream content changed");
        Assert(
            !MarkOfTheWeb.TryApplyAndVerify(Path.Combine(directory, "missing", "blocked.xlsm"), origin),
            "MOTW failure path was reported as successful");
    }

    private static void TestInstallerFallback()
    {
        Assert(Installer.IsExistingInstallFallback(new IOException(), true), "Locked install IOException fallback failed");
        Assert(Installer.IsExistingInstallFallback(new UnauthorizedAccessException(), true), "Locked install access fallback failed");
        Assert(!Installer.IsExistingInstallFallback(new UnauthorizedAccessException(), false), "Missing install must not be reused");
    }

    private static void TestSessionKeys()
    {
        var origin = new Uri("https://example.ru");
        var first = new WorkbookGrant(origin, "token", "book-a", "a.ods", "1", new string('a', 64), null);
        var same = first with { Token = "another-token", FileName = "copy.ods" };
        var otherBook = first with { WorkbookKey = "book-b" };
        var otherOrigin = first with { Origin = new Uri("https://other.example") };
        var firstPath = Path.Combine(Path.GetTempPath(), "a.ods");
        var copyPath = Path.Combine(Path.GetTempPath(), "a (2).ods");
        Assert(TrayApplicationContext.BuildSessionKey(first, firstPath) == TrayApplicationContext.BuildSessionKey(same, firstPath), "Same local copy key was not stable");
        Assert(TrayApplicationContext.BuildSessionKey(first, firstPath) != TrayApplicationContext.BuildSessionKey(same, copyPath), "Different local copies collided");
        Assert(TrayApplicationContext.BuildSessionKey(first, firstPath) != TrayApplicationContext.BuildSessionKey(otherBook, firstPath), "Different workbook keys collided");
        Assert(TrayApplicationContext.BuildSessionKey(first, firstPath) != TrayApplicationContext.BuildSessionKey(otherOrigin, firstPath), "Different origins collided");
    }

    private static void TestSolutionNamingContract()
    {
        Assert(
            SolutionNameRules.TryNormalize("  Пробник 3.xlsx  ", out var normalized, out _)
                && normalized == "Пробник 3",
            "Solution name normalization failed");
        Assert(
            !SolutionNameRules.TryNormalize("Папка/работа", out _, out _),
            "Path separators were accepted in a solution name");
        Assert(
            !SolutionNameRules.TryNormalize(new string('а', SolutionNameRules.MaxLength + 1), out _, out _),
            "Overlong solution name was accepted");

        var hash = new string('a', 64);
        var exchangePayload = JsonSerializer.Serialize(new
        {
            token = "workbook-token",
            workbookKey = "workbook-key",
            fileName = "Задание.ods",
            revision = "0",
            contentHash = hash,
            requiresName = true,
            solutionName = "Предложенное название",
            sourceText = new
            {
                fileName = "26_1.txt",
                contentHash = new string('b', 64),
                sizeBytes = 1024
            }
        });
        using var exchangeDocument = JsonDocument.Parse(exchangePayload);
        var grant = HelperApiClient.ParseExchangeResponse(
            new Uri("https://example.ru"),
            exchangeDocument.RootElement);
        Assert(grant.RequiresName, "requiresName was not parsed from exchange response");
        Assert(grant.SolutionName == "Предложенное название", "solutionName suggestion was not parsed");
        Assert(grant.SourceTextFileName == "26_1.txt", "sourceText.fileName was not parsed");
        Assert(grant.SourceTextContentHash == new string('b', 64), "sourceText.contentHash was not parsed");

        var aliasPayload = JsonSerializer.Serialize(new
        {
            token = "workbook-token",
            workbookKey = "workbook-key",
            fileName = "Задание.ods",
            revision = "0",
            contentHash = hash,
            nameRequired = true
        });
        using var aliasDocument = JsonDocument.Parse(aliasPayload);
        var aliasGrant = HelperApiClient.ParseExchangeResponse(
            new Uri("https://example.ru"),
            aliasDocument.RootElement);
        Assert(aliasGrant.RequiresName, "nameRequired compatibility alias was not parsed");

        var uploadPayload = JsonSerializer.Serialize(new
        {
            revision = "1",
            contentHash = hash,
            solutionName = "Пробник 3",
            file = new { name = "Пробник 3.ods" }
        });
        using var uploadDocument = JsonDocument.Parse(uploadPayload);
        var receipt = HelperApiClient.ParseUploadResponse(uploadDocument.RootElement, "0", hash, null);
        Assert(receipt.Revision == "1", "Named upload revision was not parsed");
        Assert(receipt.SolutionName == "Пробник 3", "Named upload solutionName was not parsed");
        Assert(receipt.FileName == "Пробник 3.ods", "Named upload file.name was not parsed");
        Assert(
            HelperApiClient.ResolveErrorMessage(
                HttpStatusCode.Conflict,
                "Решение с таким именем уже существует",
                "Решение с таким именем уже существует") == "Решение с таким именем уже существует",
            "Named-result conflict detail was hidden");
        Assert(
            HelperApiClient.ResolveErrorMessage(HttpStatusCode.Conflict, string.Empty, string.Empty)
                == "На сервере появилась более новая версия таблицы. Запустите её с платформы ещё раз.",
            "Generic revision conflict message changed");
    }

    private static void Assert(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    private static void AssertThrows<T>(Action action) where T : Exception
    {
        try
        {
            action();
        }
        catch (T)
        {
            return;
        }
        throw new InvalidOperationException($"Expected {typeof(T).Name} was not thrown");
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch
        {
            // Best effort cleanup.
        }
    }
}

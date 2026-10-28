using System.Net;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.IO.Compression;
using System.Xml.Linq;

namespace IvanEge.WorkbookHelper;

internal static class SelfTest
{
    public static string ReportPath => Path.Combine(Path.GetTempPath(), "IvanEgeWorkbookHelper-selftest.txt");

    public static int CheckUpdateInstall(string manifest, string executable)
    {
        var root = Path.Combine(Path.GetTempPath(), "IvanEgeWorkbookHelper-update-check-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(root);
            var release = HelperUpdater.VerifyManifest(File.ReadAllBytes(manifest));
            HelperUpdater.VerifyExecutable(executable, release);
            var stage = Path.Combine(root, "stage"); Directory.CreateDirectory(stage);
            File.Copy(executable, Path.Combine(stage, "package.exe"));
            var target = Path.Combine(root, "installed-helper.exe");
            File.WriteAllText(target, "previous-working-version");
            File.WriteAllText(Path.Combine(root, "student-work.txt"), "untouched");
            HelperUpdater.InstallVerified(stage, target, release);
            HelperUpdater.VerifyExecutable(target, release);
            Assert(File.ReadAllText(target + ".previous") == "previous-working-version", "Update lost the previous version");
            Assert(File.ReadAllText(Path.Combine(root, "student-work.txt")) == "untouched", "Update touched an unrelated document");
            return 0;
        }
        catch (Exception error) { File.WriteAllText(ReportPath, error.ToString()); return 1; }
        finally
        {
            try
            {
                var temporaryRoot = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                if (Path.GetFullPath(root).StartsWith(temporaryRoot, StringComparison.OrdinalIgnoreCase)
                    && Path.GetFileName(root).StartsWith("IvanEgeWorkbookHelper-update-check-", StringComparison.Ordinal)
                    && !new DirectoryInfo(root).Attributes.HasFlag(FileAttributes.ReparsePoint)) Directory.Delete(root, recursive: true);
            }
            catch { }
        }
    }

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
            TestInstallerCopy(temporaryDirectory);
            TestSessionKeys();
            TestSolutionNamingContract();
            TestStableSnapshot(temporaryDirectory).GetAwaiter().GetResult();
            TestFlatWorkbookSnapshot(temporaryDirectory).GetAwaiter().GetResult();
            TestHashValidation();
            TestLiveWorkbookXml();
            TestSparseWorkbookDifferences();
            TestPresenceHover();
            TestOfficePreference();
            TestUpdateAuthentication(temporaryDirectory);
            TestUpdateLaunchOrder();
            TestWorkbookOpenFailure();
            TestWorkbookFallback(temporaryDirectory);
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
    private static void TestWorkbookOpenFailure()
    {
        var error = new System.Runtime.InteropServices.COMException("Class not registered", unchecked((int)0x80040154));
        var message = WorkbookOpenFailure.AtStage("Excel", "запуск приложения", error);
        Assert(message.Contains("запуск приложения") && message.Contains("Class not registered") && message.Contains("0x80040154"), "A startup failure must preserve the stage, native reason and HRESULT");
        Assert(WorkbookOpenFailure.Details(message).Contains(HelperUpdater.CurrentVersion.ToString(3)), "Copied launch diagnostics must identify the running helper version");
    }
    private static void TestWorkbookFallback(string directory)
    {
        var source = Path.Combine(directory, "book.xlsx");
        File.WriteAllText(source, "saved checkpoint");
        var copy = WorkbookFallback.CreateCopy(source, new Uri("https://ivan100.ru"));
        Assert(copy != source && File.ReadAllText(copy) == "saved checkpoint", "Fallback must open a distinct copy of the downloaded checkpoint");
        File.WriteAllText(copy, "student local edit");
        var second = WorkbookFallback.CreateCopy(source, new Uri("https://ivan100.ru"));
        Assert(second != copy && File.ReadAllText(copy) == "student local edit" && File.ReadAllText(source) == "saved checkpoint", "A fallback retry must not overwrite the source or an edited ordinary copy");
        Assert(WorkbookFallback.Explanation.Contains("автоматически сохраняет") && WorkbookFallback.Explanation.Contains("последнее сохранение"), "Fallback must explain automatic whole-file saving without claiming cell synchronization");
    }
    private static void TestUpdateLaunchOrder()
    {
        var gate = new HelperUpdateLaunchGate();
        HelperUpdateLaunchAction Next(bool checking = false, bool pending = false, bool safe = true,
            bool busy = false, bool automatic = true, bool manual = false, bool request = true, bool applyAllowed = true)
            => gate.Next(automatic, manual, safe, busy, request, checking, pending, applyAllowed);

        Assert(Next() == HelperUpdateLaunchAction.Check, "A workbook must wait for an update check before opening");
        Assert(Next(checking: true) == HelperUpdateLaunchAction.Wait, "Downloading an update must not open the workbook early");
        Assert(Next(pending: true) == HelperUpdateLaunchAction.Apply, "A queued workbook must not prevent a prepared update");
        gate.RequestStarted();
        Assert(Next(checking: true) == HelperUpdateLaunchAction.Wait, "An existing background check must be reused before opening");
        Assert(Next() == HelperUpdateLaunchAction.Continue, "No update or a failed check must allow the original request to open");
        gate.RequestStarted();
        Assert(Next(safe: false, pending: true) == HelperUpdateLaunchAction.Continue, "An open or unsaved workbook must never be interrupted for an update");
        Assert(Next(busy: true, pending: true) == HelperUpdateLaunchAction.Wait, "An accepted workbook request must finish before handoff");
        Assert(Next(pending: true, request: false) == HelperUpdateLaunchAction.Apply, "Closing the last saved workbook must allow an idle update");
        Assert(Next(automatic: false, pending: true) == HelperUpdateLaunchAction.Continue, "Disabled automatic updates must be respected");
        Assert(Next(automatic: false, manual: true, pending: true) == HelperUpdateLaunchAction.Apply, "A manual update may apply at a safe point");
        gate.RequestStarted();
        Assert(Next(pending: true, applyAllowed: false) == HelperUpdateLaunchAction.Check, "A failed update launch must not prevent checking or opening");
        Assert(Next(pending: true, applyAllowed: false) == HelperUpdateLaunchAction.Continue, "Update retry backoff must not trap the queued workbook");
    }

    private static void TestUpdateAuthentication(string directory)
    {
        using var signer = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        using var stranger = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var source = Environment.ProcessPath!;
        var bytes = File.ReadAllBytes(source);
        var version = FileVersionInfo.GetVersionInfo(source).FileVersion!;
        var release = new HelperUpdateRelease(version, $"https://ivan100.ru/downloads/updates/IvanEgeWorkbookHelper-{version}.exe", Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), bytes.Length);
        byte[] Envelope(HelperUpdateRelease value, string product = HelperUpdater.Product)
        {
            var payload = JsonSerializer.SerializeToUtf8Bytes(new { schema = 1, product, version = value.Version, url = value.Url, sha256 = value.Sha256, bytes = value.Bytes });
            return JsonSerializer.SerializeToUtf8Bytes(new { payload = Convert.ToBase64String(payload), signature = Convert.ToBase64String(signer.SignData(payload, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence)) });
        }
        var envelope = Envelope(release);
        var key = signer.ExportSubjectPublicKeyInfo();
        Assert(HelperUpdater.VerifyManifest(envelope, key) == release, "Valid signed update was rejected");
        AssertThrows<CryptographicException>(() => HelperUpdater.VerifyManifest(envelope, stranger.ExportSubjectPublicKeyInfo()));
        AssertThrows<InvalidDataException>(() => HelperUpdater.VerifyManifest(new byte[HelperUpdater.MaxManifestBytes + 1], key));
        AssertThrows<InvalidDataException>(() => HelperUpdater.VerifyManifest(Envelope(release, "other-app"), key));
        foreach (var url in new[] { "http://ivan100.ru/downloads/update.exe", "https://evil.example/update.exe", "https://ivan100.ru@evil.example/update.exe", release.Url + "?redirect=1" })
            AssertThrows<InvalidDataException>(() => HelperUpdater.VerifyManifest(Envelope(release with { Url = url }), key));
        AssertThrows<InvalidDataException>(() => HelperUpdater.ValidateRelease(release with { Version = "../2.exe" }));
        AssertThrows<InvalidDataException>(() => HelperUpdater.ValidateRelease(release with { Bytes = HelperUpdater.MaxExecutableBytes + 1 }));
        HelperUpdater.VerifyExecutable(source, release);
        AssertThrows<CryptographicException>(() => HelperUpdater.VerifyExecutable(source, release with { Sha256 = new string('0', 64) }));
        using var bounded = new MemoryStream();
        AssertThrows<InvalidDataException>(() => HelperUpdater.CopyBoundedAsync(new MemoryStream(new byte[256]), bounded, 128, CancellationToken.None).GetAwaiter().GetResult());
        Assert(bounded.Length == 0, "Oversized update must not be written");
        var stage = Path.Combine(directory, "update-stage"); Directory.CreateDirectory(stage);
        File.WriteAllBytes(Path.Combine(stage, "package.exe"), bytes);
        var target = Path.Combine(directory, "old-helper.exe");
        File.WriteAllText(target, "previous helper");
        File.SetAttributes(target, FileAttributes.ReadOnly);
        HelperUpdater.InstallVerified(stage, target, release, runSelfTest: false);
        Assert(File.ReadAllText(target + ".previous") == "previous helper", "Atomic update must preserve the old executable");
        HelperUpdater.VerifyExecutable(target, release);
        File.WriteAllText(Path.Combine(stage, "package.exe"), "truncated download");
        AssertThrows<CryptographicException>(() => HelperUpdater.InstallVerified(stage, target, release, runSelfTest: false));
        HelperUpdater.VerifyExecutable(target, release);
        using var productionKey = ECDsa.Create(); productionKey.ImportSubjectPublicKeyInfo(HelperUpdater.PublicKey(), out _);
        Assert(productionKey.KeySize == 256, "Update trust key must be P-256");
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
        Assert(ProtocolRequestParser.Parse("ivan-ege://open?origin=https%3A%2F%2Fivan100.ru&ticket=abcdefghijklmnop&engine=calc").Engine == "calc", "Explicit office choice must reach the helper");
        AssertThrows<FormatException>(() => ProtocolRequestParser.Parse("ivan-ege://open?origin=https%3A%2F%2Fivan100.ru&ticket=abcdefghijklmnop&engine=cmd.exe"));

        AssertThrows<FormatException>(() => ProtocolRequestParser.Parse(
            "ivan-ege://open?origin=http%3A%2F%2Fevil.example&ticket=abcdefghijklmnop"));
        AssertThrows<FormatException>(() => ProtocolRequestParser.Parse(
            "ivan-ege://open?origin=https%3A%2F%2Fexample.ru&origin=https%3A%2F%2Fother.ru&ticket=abcdefghijklmnop"));
        AssertThrows<FormatException>(() => ProtocolRequestParser.Parse(
            "ivan-ege://delete?origin=https%3A%2F%2Fexample.ru&ticket=abcdefghijklmnop"));
    }
    private static void TestOfficePreference()
    {
        Assert(LiveOfficePreference.Resolve("auto", @"C:\Program Files\LibreOffice\program\soffice.exe", true, true) == "calc", "Windows LibreOffice association must be respected");
        Assert(LiveOfficePreference.Resolve("auto", @"C:\Office\EXCEL.EXE", true, true) == "calc", "Automatic mode must prefer LibreOffice even when Windows associates files with Excel");
        Assert(LiveOfficePreference.Resolve("auto", null, true, false) == "excel", "Excel-only installations must open Excel");
        Assert(LiveOfficePreference.Resolve("auto", null, false, true) == "calc", "LibreOffice-only installations must open Calc");
        Assert(LiveOfficePreference.Resolve("calc", "EXCEL.EXE", true, true) == "calc", "Explicit helper program preference must win");
        Assert(LiveOfficePreference.Resolve("excel", null, false, true) == "calc", "An uninstalled preferred program must fall back to the installed one");
        AssertThrows<InvalidOperationException>(() => LiveOfficePreference.Resolve("auto", null, false, false));
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

    private static void TestSparseWorkbookDifferences()
    {
        var before = System.Text.Json.Nodes.JsonNode.Parse("""{"sheets":[{"id":"s1","name":"Лист1","cells":{"A1":{"content":{"kind":"number","value":12},"fill":null},"B2":{"content":{"kind":"empty"},"fill":123}}},{"id":"s2","name":"Лист2","cells":{"C3":{"content":{"kind":"text","value":"до"},"fill":null}}}]}""")!.AsObject();
        var after = (System.Text.Json.Nodes.JsonObject)before.DeepClone();
        after["sheets"]![0]!["cells"]!["A1"]!["content"] = System.Text.Json.Nodes.JsonNode.Parse("""{"kind":"formula","value":"=SUM(B1:B3)"}""");
        after["sheets"]![0]!["cells"]!.AsObject().Remove("B2");
        after["sheets"]![1]!["cells"]!["C3"]!["content"]!["value"] = "после";
        after["sheets"]![1]!["cells"]!["D4"] = System.Text.Json.Nodes.JsonNode.Parse("""{"content":{"kind":"boolean","value":true},"fill":255}""");
        var versions = System.Text.Json.Nodes.JsonNode.Parse("""{"s1/A1/content":7,"s2/C3/content":12}""")!.AsObject();
        var touched = new HashSet<(string Sheet, string Address, string Property)>();
        foreach (var (sheet, address) in new[] { ("s1", "A1"), ("s1", "B2"), ("s2", "C3"), ("s2", "D4"), ("s1", "Z9") })
        { touched.Add((sheet, address, "content")); touched.Add((sheet, address, "fill")); }
        var full = LiveWorkbookBook.Differences(before, after, versions, 3);
        var sparse = LiveWorkbookBook.Differences(before, after, versions, 3, touched);
        Assert(full.Count == sparse.Count, "Sparse sync dropped cell content, a deletion, a fill or another sheet");
        foreach (var change in full)
            Assert(sparse.Any(other => System.Text.Json.Nodes.JsonNode.DeepEquals(change, other)), "Sparse sync changed a value or its conflict version");
        Assert(LiveWorkbookBook.Differences(after, after, versions, 3, touched).Count == 0, "Unchanged touched properties must not create edits");
        Assert(LiveWorkbookBook.Structural(before, after, full) == LiveWorkbookBook.Structural(before, after, sparse), "Sparse sync must retain structural-change guards");
    }

    private static void TestPresenceHover()
    {
        var frame = System.Text.Json.Nodes.JsonNode.Parse("""{"view":[20,40,500,400],"marks":[{"bounds":[40,60,120,50],"name":"Учитель","color":"#8b5cf6"},{"bounds":[100,90,100,40],"name":"Ученик","color":"#0d9488"},{"bounds":[0,0,10,10],"name":"За пределами листа","color":"#2563eb"}]}""")!.AsObject();
        Assert(LivePresenceOverlay.HitTest(frame, new System.Drawing.Point(45, 65))?["name"]!.GetValue<string>() == "Учитель", "Hover must identify a participant only inside the marked range");
        Assert(LivePresenceOverlay.HitTest(frame, new System.Drawing.Point(110, 95))?["name"]!.GetValue<string>() == "Ученик", "Overlapping marks must identify the visible top range");
        Assert(LivePresenceOverlay.HitTest(frame, new System.Drawing.Point(300, 300)) is null, "An unmarked cell must not show an old participant name");
        Assert(LivePresenceOverlay.HitTest(frame, new System.Drawing.Point(5, 5)) is null, "Hover must stay within the workbook viewport");
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

    private static void TestInstallerCopy(string directory)
    {
        var source = Path.Combine(directory, "new-install.exe");
        var target = Path.Combine(directory, "existing-install.exe");
        File.WriteAllText(source, "new helper"); File.WriteAllText(target, "old helper");
          File.SetAttributes(target, FileAttributes.ReadOnly);
        using (var locked = new FileStream(target, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            Exception? blocked = null;
            try { Installer.CopyForInstall(source, target); }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException) { blocked = error; }
            Assert(blocked is not null, "A locked executable must prevent installation rather than silently reuse the old version");
            Assert(File.ReadAllText(target) == "old helper", "A locked install must stay intact and cannot be reported as updated");
            Assert(!Directory.EnumerateFiles(directory, "existing-install.exe.*.new").Any(), "Failed manual update left an incomplete executable");
              Assert(File.GetAttributes(target).HasFlag(FileAttributes.ReadOnly), "A failed install must restore the previous file attributes");
        }
        Installer.CopyForInstall(source, target);
        Assert(File.ReadAllText(target) == "new helper", "Retry after closing the old helper must install the new bytes");
          Assert(!File.GetAttributes(target).HasFlag(FileAttributes.ReadOnly), "A read-only old executable must not block future updates");
        using (var locked = new FileStream(target, FileMode.Open, FileAccess.Read, FileShare.Read))
            Installer.CopyForInstall(source, target); // The identical installed version needs no replacement.
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

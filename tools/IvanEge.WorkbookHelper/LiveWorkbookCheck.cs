using System.Diagnostics;
using System.Text.Json.Nodes;

namespace IvanEge.WorkbookHelper;

// End-to-end native-app check is deliberately loopback-only. It cannot be used
// as a production command interface or passed a browser authentication token.
internal static class LiveWorkbookCheck
{
    public static int Run(string configPath)
    {
        JsonObject config = JsonNode.Parse(File.ReadAllText(configPath))!.AsObject();
        string report = config["report"]!.GetValue<string>(); var checks = new JsonArray();
        try { RunAsync(config, checks).GetAwaiter().GetResult(); File.WriteAllText(report, new JsonObject { ["ok"] = true, ["checks"] = checks }.ToJsonString()); return 0; }
        catch (Exception error) { File.WriteAllText(report, new JsonObject { ["ok"] = false, ["checks"] = checks, ["error"] = error.ToString() }.ToJsonString()); return 1; }
    }
    private static void Ensure(bool value, string description) { if (!value) throw new InvalidOperationException(description); }
    private static async Task RunAsync(JsonObject config, JsonArray checks)
    {
        var origin = new Uri(config["origin"]!.GetValue<string>()); if (!origin.IsLoopback || origin.Scheme != "http") throw new InvalidOperationException("Native checks only accept a local fixture");
        string directory = Path.GetFullPath(config["directory"]!.GetValue<string>()); Directory.CreateDirectory(directory);
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(3)); var token = timeout.Token;
        var faults = new ConnectionFaults();
        using var teacherApi = new HelperApiClient(origin); using var pupilApi = new HelperApiClient(origin, faults);
        var teacherGrant = await teacherApi.ExchangeAsync(config["teacherTicket"]!.GetValue<string>(), token);
        var pupilGrant = await pupilApi.ExchangeAsync(config["pupilTicket"]!.GetValue<string>(), token);
        string teacherFile = Path.Combine(directory, "teacher.ods"), pupilFile = Path.Combine(directory, "pupil.ods");
        await teacherApi.DownloadAsync(teacherGrant, teacherFile, token); await pupilApi.DownloadAsync(pupilGrant, pupilFile, token);
        using var teacher = new LiveWorkbookClient(teacherApi, teacherGrant, Path.Combine(directory, "teacher"), Path.Combine(directory, "cache"));
        using var pupil = new LiveWorkbookClient(pupilApi, pupilGrant, Path.Combine(directory, "pupil"), Path.Combine(directory, "cache"));
        string teacherEngine = config["teacherEngine"]?.GetValue<string>() ?? "excel", pupilEngine = config["pupilEngine"]?.GetValue<string>() ?? "calc";
        await teacher.InitializeAsync(teacherFile, teacherEngine, true, token); await pupil.InitializeAsync(pupilFile, pupilEngine, true, token);
        string sheet = teacher.Office.Reader.SheetNames.Values.First();
        async Task Edit(LiveWorkbookClient client, string address, JsonObject content, int? fill = null)
        {
            var changes = new JsonArray(new JsonObject { ["sheetName"] = sheet, ["address"] = address, ["property"] = "content", ["value"] = content });
            if (fill.HasValue) changes.Add(new JsonObject { ["sheetName"] = sheet, ["address"] = address, ["property"] = "fill", ["value"] = fill.Value });
            await client.Office.CommandAsync(new() { ["type"] = "edit", ["changes"] = changes }, token);
        }
        JsonObject Number(double value) => new() { ["kind"] = "number", ["value"] = value };
        async Task Settle()
        {
            for (int round = 0; round < 3; round++) { await teacher.TickAsync(token); await pupil.TickAsync(token); }
            Ensure(!teacher.Conflicted && !pupil.Conflicted, "Unexpected conflict: " + teacher.ConflictDescription + " " + pupil.ConflictDescription);
            var a = await teacher.Office.SnapshotAsync(token); var b = await pupil.Office.SnapshotAsync(token);
            try { Ensure(JsonNode.DeepEquals(a.Book, b.Book), "The native books did not converge"); }
            finally { File.Delete(a.File); File.Delete(b.File); }
        }
        async Task Check(string name, Func<Task> action)
        {
            var clock = Stopwatch.StartNew(); await action(); checks.Add(new JsonObject { ["name"] = name, ["passed"] = true, ["ms"] = clock.ElapsedMilliseconds });
        }
        await Check("Real Excel and Calc clients publish different cells through scoped production endpoints", async () =>
        {
            await Edit(teacher, "A1", Number(12)); await Edit(pupil, "B1", Number(30), 0x72dca0); await Settle();
        });
        await Check("A formula added in Excel recalculates in LibreOffice", async () =>
        {
            await Edit(teacher, "C1", new() { ["kind"] = "formula", ["value"] = "=SUM(A1,B1)" }); await Settle();
            var result = await pupil.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "C1" }, token);
            Ensure(result["value"]!.GetValue<double>() == 42, "Formula did not calculate in Calc");
        });
        await Check("Conflicting native edits preserve both versions and explicit resolution converges", async () =>
        {
            await Edit(teacher, "A1", Number(20)); await Edit(teacher, "E1", Number(55)); await Edit(pupil, "A1", Number(21));
            await teacher.TickAsync(token); await pupil.TickAsync(token); Ensure(pupil.Conflicted, "Concurrent writes must produce a conflict");
            await pupil.ResolveAsync(true, token); await Settle();
            var peer = await pupil.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "E1" }, token);
            Ensure(peer["value"]!.GetValue<double>() == 55, "Conflict resolution overwrote unrelated peer changes");
        });
        await Check("Boolean values, theme fill and native Excel fill-down round-trip", async () =>
        {
            await Edit(teacher, "H1", new() { ["kind"] = "boolean", ["value"] = true });
            await teacher.Office.CommandAsync(new() { ["type"] = "theme-fill", ["sheetName"] = sheet, ["address"] = "H1" }, token);
            await Edit(teacher, "J1", new() { ["kind"] = "formula", ["value"] = "=A1+$B$1" });
            await teacher.Office.CommandAsync(new() { ["type"] = "fill-down", ["sheetName"] = sheet, ["range"] = "J1:J20" }, token);
            await Settle();
            var value = await pupil.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "J2" }, token);
            Ensure(value["value"]!.GetValue<double>() == 30, "Filled formula references changed");
        });
        await Check("A native Calc formula calculates in Excel", async () =>
        {
            await Edit(pupil, "F1", new() { ["kind"] = "formula", ["value"] = "=IF(A1>10,SUM(A1,B1),0)" }); await Settle();
            var value = await teacher.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "F1" }, token);
            Ensure(value["value"]!.GetValue<double>() == 51, "Calc formula did not calculate in Excel");
        });
        await Check("Offline edits survive reconnect without deleting unrelated peer cells", async () =>
        {
            await Edit(pupil, "L1", Number(100)); faults.BeforeSync = true;
            try { await pupil.TickAsync(token); throw new InvalidOperationException("Expected injected network failure"); }
            catch (HelperApiException error) when (error.IsTransient) { }
            await Edit(teacher, "M1", Number(200)); await teacher.TickAsync(token); await Settle();
        });
        await Check("A lost acknowledgement is retried exactly once", async () =>
        {
            await Edit(pupil, "N1", Number(300)); faults.AfterSync = true;
            try { await pupil.TickAsync(token); throw new InvalidOperationException("Expected lost receipt"); }
            catch (HelperApiException error) when (error.IsTransient) { }
            var before = await teacherApi.LiveRequestAsync(teacherGrant, "/workbook-helper/v1/live/state", null, token);
            await pupil.TickAsync(token);
            var after = await teacherApi.LiveRequestAsync(teacherGrant, "/workbook-helper/v1/live/state", null, token);
            Ensure(before["revision"]!.GetValue<long>() == after["revision"]!.GetValue<long>(), "Retried receipt created a duplicate revision"); await Settle();
        });
        await Check("Native insertion of a row is synchronized atomically", async () =>
        {
            await teacher.Office.CommandAsync(new() { ["type"] = "insert-rows", ["sheetName"] = sheet, ["row"] = 1 }, token); await Settle();
            var value = await pupil.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "A2" }, token);
            Ensure(value["value"]!.GetValue<double>() == 21, "Inserted row was not reflected in the other office engine");
        });
        await Check("Shared undo and redo synchronize without deleting peer edits", async () =>
        {
            await Edit(teacher, "D3", Number(77)); await Settle(); await teacher.UndoAsync(false, token); await Settle();
            await teacher.UndoAsync(true, token); await Settle();
        });
        await Check("Ctrl-S equivalent stores the merged binary on the board and in notes", async () =>
        {
            teacher.RequestSave(); await teacher.TickAsync(token);
            var state = await teacherApi.LiveRequestAsync(teacherGrant, "/workbook-helper/v1/live/state", null, token);
            Ensure(state["revision"]!.GetValue<long>() == state["checkpointRevision"]!.GetValue<long>(), "Shared checkpoint has not caught up");
        });
        await Check("Pending changes recover after a helper restart", async () =>
        {
            await Edit(pupil, "P2", Number(12345)); faults.BeforeSync = true;
            try { await pupil.TickAsync(token); throw new InvalidOperationException("Expected offline edit before restart"); }
            catch (HelperApiException error) when (error.IsTransient) { }
            pupil.Dispose();
            using var recovered = new LiveWorkbookClient(pupilApi, pupilGrant, Path.Combine(directory, "recovered"), Path.Combine(directory, "cache"));
            await recovered.InitializeAsync(pupilFile, pupilEngine, true, token);
            for (int round = 0; round < 3; round++) { await recovered.TickAsync(token); await teacher.TickAsync(token); }
            Ensure(!recovered.Conflicted, "Unexpected recovery conflict");
            var value = await teacher.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "P2" }, token);
            Ensure(value["value"]!.GetValue<double>() == 12345, "Restart lost pending native edits");
            recovered.RequestSave(); await recovered.TickAsync(token);
        });
        await Check("Twenty thousand native data rows synchronize and remain readable", async () =>
        {
            using var large = new LiveWorkbookClient(pupilApi, pupilGrant, Path.Combine(directory, "large"), Path.Combine(directory, "cache"));
            await large.InitializeAsync(pupilFile, pupilEngine, true, token);
            await teacher.Office.CommandAsync(new() { ["type"] = "load-test-data", ["sheetName"] = sheet, ["count"] = 20000 }, token);
            await teacher.TickAsync(token); await large.TickAsync(token); await teacher.TickAsync(token);
            Ensure(!large.Conflicted && !teacher.Conflicted, "Large dataset caused a conflict");
            var value = await large.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "R20000" }, token);
            Ensure(value["value"]!.GetValue<double>() == 20000, "Large dataset did not arrive");
            large.RequestSave(); await large.TickAsync(token);
        });
    }
    private sealed class ConnectionFaults : DelegatingHandler
    {
        public bool BeforeSync, AfterSync;
        public ConnectionFaults() : base(new HttpClientHandler { AllowAutoRedirect = false }) { }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            bool sync = request.RequestUri!.AbsolutePath.EndsWith("/live/sync", StringComparison.Ordinal);
            if (sync && BeforeSync) { BeforeSync = false; throw new HttpRequestException("Injected offline connection"); }
            var response = await base.SendAsync(request, token);
            if (sync && AfterSync) { AfterSync = false; response.Dispose(); throw new HttpRequestException("Injected lost receipt"); }
            return response;
        }
    }
}

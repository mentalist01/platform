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
        if (config["capacityCheck"]?.GetValue<bool>() == true) { await LiveWorkbookCapacityCheck.RunAsync(config, checks); return; }
        var origin = new Uri(config["origin"]!.GetValue<string>()); if (!origin.IsLoopback || origin.Scheme != "http") throw new InvalidOperationException("Native checks only accept a local fixture");
        string directory = Path.GetFullPath(config["directory"]!.GetValue<string>()); Directory.CreateDirectory(directory);
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(3)); var token = timeout.Token;
        var faults = new ConnectionFaults();
        using var teacherApi = new HelperApiClient(origin); using var pupilApi = new HelperApiClient(origin, faults);
        var teacherGrant = await teacherApi.ExchangeAsync(config["teacherTicket"]!.GetValue<string>(), token);
        var pupilGrant = await pupilApi.ExchangeAsync(config["pupilTicket"]!.GetValue<string>(), token);
        string teacherFile = Path.Combine(directory, "teacher" + Path.GetExtension(teacherGrant.FileName)), pupilFile = Path.Combine(directory, "pupil" + Path.GetExtension(pupilGrant.FileName));
        await teacherApi.DownloadAsync(teacherGrant, teacherFile, token); await pupilApi.DownloadAsync(pupilGrant, pupilFile, token);
        using var teacher = new LiveWorkbookClient(teacherApi, teacherGrant, Path.Combine(directory, "teacher"), Path.Combine(directory, "cache"));
        using var pupil = new LiveWorkbookClient(pupilApi, pupilGrant, Path.Combine(directory, "pupil"), Path.Combine(directory, "cache"));
        string teacherEngine = config["teacherEngine"]?.GetValue<string>() ?? "excel", pupilEngine = config["pupilEngine"]?.GetValue<string>() ?? "calc";
        bool hidden = config["hidden"]?.GetValue<bool>() ?? true;
        await teacher.InitializeAsync(teacherFile, teacherEngine, hidden, token); await pupil.InitializeAsync(pupilFile, pupilEngine, hidden, token);
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
            try { Ensure(JsonNode.DeepEquals(a.Book, b.Book), "The native books did not converge. Filters: " + a.Book["sheets"]![0]!["filter"] + " / " + b.Book["sheets"]![0]!["filter"]); }
            finally { File.Delete(a.File); File.Delete(b.File); }
        }
        if (teacherGrant.Live!.EventsSupported && pupilGrant.Live!.EventsSupported)
        {
            var started = Stopwatch.StartNew();
            while (!teacher.UsesPush || !pupil.UsesPush)
            { Ensure(started.ElapsedMilliseconds < 5000, "Native clients did not connect to the push channel"); await Task.Delay(25, token); }
            checks.Add(new JsonObject { ["name"] = "authenticated-native-push-connected", ["passed"] = true });
            teacher.RestartPush(); started.Restart();
            while (teacher.UsesPush && started.ElapsedMilliseconds < 2000) await Task.Delay(10, token);
            Ensure(!teacher.UsesPush, "A broken push socket was not detected");
            while (!teacher.UsesPush)
            { Ensure(started.ElapsedMilliseconds < 6000, "Push did not reconnect automatically"); await Task.Delay(25, token); }
            checks.Add(new JsonObject { ["name"] = "native-push-reconnects-with-same-scoped-session", ["passed"] = true });
        }
        async Task Check(string name, Func<Task> action)
        {
            var clock = Stopwatch.StartNew(); await action(); checks.Add(new JsonObject { ["name"] = name, ["passed"] = true, ["ms"] = clock.ElapsedMilliseconds });
            File.WriteAllText(config["report"]!.GetValue<string>() + ".progress.json", checks.ToJsonString());
        }
        await Check("Native cell and range presence reaches the peer without changing its own selection or workbook", async () =>
        {
            var wanted = new JsonArray(new JsonArray(2, 1, 8, 3));
            await teacher.Office.CommandAsync(new() { ["type"] = "select", ["sheetName"] = sheet, ["ranges"] = wanted.DeepClone() }, token);
            var own = await teacher.Office.CommandAsync(new() { ["type"] = "pulse" }, token);
            Ensure(JsonNode.DeepEquals(own["selection"]!["ranges"], wanted), "Native range selection was not captured: " + own);
            Ensure(own["watching"]?.GetValue<bool>() == true, "Native change events were not installed: " + own);
            await teacherApi.LiveRequestAsync(teacherGrant, "/workbook-helper/v1/live/presence", new() { ["selection"] = own["selection"]!.DeepClone() }, token);
            var before = await pupil.Office.CommandAsync(new() { ["type"] = "pulse" }, token);
            var peers = await pupilApi.LiveRequestAsync(pupilGrant, "/workbook-helper/v1/live/presence", new() { ["selection"] = before["selection"]!.DeepClone() }, token);
            Ensure(peers["peers"]!.AsArray().Count == 1, "Peer presence was not delivered");
            var after = await pupil.Office.CommandAsync(new() { ["type"] = "pulse", ["peers"] = peers["peers"]!.DeepClone() }, token);
            Ensure(JsonNode.DeepEquals(before["selection"], after["selection"]), "Peer selection moved our own cursor");
            if (!hidden) Ensure(after["marks"]!.AsArray().Count > 0, "Visible native peer rectangles were not located: " + after);
            var snapshot = await pupil.Office.SnapshotAsync(token);
            try { Ensure(JsonNode.DeepEquals(snapshot.Book, (await pupilApi.LiveRequestAsync(pupilGrant, "/workbook-helper/v1/live/state", null, token))["book"]), "Presence changed saved workbook contents"); }
            finally { File.Delete(snapshot.File); }
        });
        await Check("Peer ranges follow native zoom and scroll without changing the local cursor", async () =>
        {
            if (hidden) return;
            var own = await teacher.Office.CommandAsync(new() { ["type"] = "pulse" }, token);
            await teacherApi.LiveRequestAsync(teacherGrant, "/workbook-helper/v1/live/presence", new() { ["selection"] = own["selection"]!.DeepClone() }, token);
            var local = await pupil.Office.CommandAsync(new() { ["type"] = "pulse" }, token);
            var peers = (await pupilApi.LiveRequestAsync(pupilGrant, "/workbook-helper/v1/live/presence", new() { ["selection"] = local["selection"]!.DeepClone() }, token))["peers"]!;
            var first = await pupil.Office.CommandAsync(new() { ["type"] = "pulse", ["peers"] = peers.DeepClone() }, token);
            await pupil.Office.CommandAsync(new() { ["type"] = "view", ["zoom"] = 140, ["row"] = 1, ["column"] = 1 }, token);
            await Task.Delay(250, token);
            var moved = await pupil.Office.CommandAsync(new() { ["type"] = "pulse", ["peers"] = peers.DeepClone() }, token);
            Ensure(moved["marks"]!.AsArray().Count > 0, "Zoomed peer range is missing: " + moved);
            Ensure(!JsonNode.DeepEquals(first["marks"], moved["marks"]), "Peer geometry did not follow zoom/scroll");
            Ensure(JsonNode.DeepEquals(local["selection"], moved["selection"]), "Zoom/scroll presence moved the local cursor");
            await pupil.Office.CommandAsync(new() { ["type"] = "view", ["zoom"] = 100, ["row"] = 0, ["column"] = 0 }, token);
        });
        await Check("Selected named objects are identified and outlined in the other native application", async () =>
        {
            foreach (var client in new[] { teacher, pupil }) await client.Office.CommandAsync(new() { ["type"] = "fixture-object", ["name"] = "PresenceFixture" }, token);
            var selected = await teacher.Office.CommandAsync(new() { ["type"] = "pulse" }, token);
            Ensure(selected["selection"]!["objects"]!.AsArray().Count == 1, "Native object selection is missing: " + selected);
            await teacherApi.LiveRequestAsync(teacherGrant, "/workbook-helper/v1/live/presence", new() { ["selection"] = selected["selection"]!.DeepClone() }, token);
            var local = await pupil.Office.CommandAsync(new() { ["type"] = "pulse" }, token);
            var peers = (await pupilApi.LiveRequestAsync(pupilGrant, "/workbook-helper/v1/live/presence", new() { ["selection"] = local["selection"]!.DeepClone() }, token))["peers"]!;
            var rendered = await pupil.Office.CommandAsync(new() { ["type"] = "pulse", ["peers"] = peers.DeepClone() }, token);
            for (int retry = 0; !hidden && rendered["marks"]!.AsArray().Count == 0 && retry < 8; retry++)
            {
                await Task.Delay(200, token);
                rendered = await pupil.Office.CommandAsync(new() { ["type"] = "pulse", ["peers"] = peers.DeepClone() }, token);
            }
            if (!hidden) Ensure(rendered["marks"]!.AsArray().Count > 0, "Named native object could not be outlined: " + rendered);
            foreach (var client in new[] { teacher, pupil }) await client.Office.CommandAsync(new() { ["type"] = "select", ["sheetName"] = sheet, ["ranges"] = new JsonArray(new JsonArray(0, 0, 0, 0)) }, token);
        });
        await Check("Multi-range presence remains visible across frozen rows and columns", async () =>
        {
            if (hidden) return;
            var ranges = new JsonArray(new JsonArray(0, 0, 8, 3), new JsonArray(11, 5, 12, 6));
            await teacher.Office.CommandAsync(new() { ["type"] = "select", ["sheetName"] = sheet, ["ranges"] = ranges.DeepClone() }, token);
            var selected = await teacher.Office.CommandAsync(new() { ["type"] = "pulse" }, token);
            Ensure(selected["selection"]!["ranges"]!.AsArray().Count == 2, "Multiple native ranges were not captured");
            await teacherApi.LiveRequestAsync(teacherGrant, "/workbook-helper/v1/live/presence", new() { ["selection"] = selected["selection"]!.DeepClone() }, token);
            var local = await pupil.Office.CommandAsync(new() { ["type"] = "pulse" }, token);
            var peers = (await pupilApi.LiveRequestAsync(pupilGrant, "/workbook-helper/v1/live/presence", new() { ["selection"] = local["selection"]!.DeepClone() }, token))["peers"]!;
            await pupil.Office.CommandAsync(new() { ["type"] = "view", ["zoom"] = 100, ["row"] = 3, ["column"] = 2, ["freezeRows"] = 2, ["freezeColumns"] = 1 }, token);
            await Task.Delay(250, token);
            var frame = await pupil.Office.CommandAsync(new() { ["type"] = "pulse", ["peers"] = peers.DeepClone() }, token);
            Ensure(frame["marks"]!.AsArray().Count >= 2, "Peer ranges disappeared in a frozen pane: " + frame);
            await pupil.Office.CommandAsync(new() { ["type"] = "view", ["zoom"] = 100, ["row"] = 0, ["column"] = 0, ["freezeRows"] = 0, ["freezeColumns"] = 0 }, token);
        });
        await Check("Committed native edits use the fast poll path and idle cursors avoid repeated full snapshots", async () =>
        {
            for (int round = 0; round < 3; round++)
            {
                await Edit(teacher, "Z1", Number(100 + round)); var clock = Stopwatch.StartNew();
                while (true)
                {
                    await Task.WhenAll(teacher.PollAsync(token), pupil.PollAsync(token));
                    var value = await pupil.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "Z1" }, token);
                    if (value["value"]?.GetValue<double>() == 100 + round) break;
                    Ensure(clock.ElapsedMilliseconds < 2500, "Native committed edit exceeded the fast poll budget");
                    await Task.Delay(100, token);
                }
            }
            await teacher.PollAsync(token); long before = teacher.Office.SnapshotCount;
            for (int i = 0; i < 6; i++) { await Task.Delay(100, token); await teacher.PollAsync(token); }
            Ensure(teacher.Office.SnapshotCount - before <= 1, "Idle presence repeatedly exported the complete workbook");
            // Leave the semantic fixture empty for the convergence cases below.
            await Edit(teacher, "Z1", new() { ["kind"] = "empty" }); await Settle();
        });
        if (config["presenceOnly"]?.GetValue<bool>() == true) return;
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
        await Check("Concurrent fills converge without a blocking conflict and later edits still arrive", async () =>
        {
            await Edit(teacher, "D2", Number(7)); await Settle();
            async Task Fill(LiveWorkbookClient client, int color) => await client.Office.CommandAsync(new() { ["type"] = "edit", ["changes"] = new JsonArray(new JsonObject { ["sheetName"] = sheet, ["address"] = "D2", ["property"] = "fill", ["value"] = color }) }, token);
            await Fill(teacher, 0xff0000); await Fill(pupil, 0x00ff00);
            await teacher.TickAsync(token); await pupil.TickAsync(token); await Settle();
            var left = await teacher.Office.SnapshotAsync(token); var right = await pupil.Office.SnapshotAsync(token);
            try { Ensure(JsonNode.DeepEquals(left.Book, right.Book), "Concurrent fill left the editors different"); }
            finally { File.Delete(left.File); File.Delete(right.File); }
            await Edit(teacher, "G8", Number(888)); await Edit(pupil, "H8", Number(777)); await Settle();
            var teacherValue = await teacher.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "H8" }, token);
            var pupilValue = await pupil.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "G8" }, token);
            Ensure(teacherValue["value"]!.GetValue<double>() == 777 && pupilValue["value"]!.GetValue<double>() == 888, "Synchronization did not resume after colors collided");
        });
        await Check("A persisted color conflict from an older helper recovers after reopening", async () =>
        {
            var state = await teacherApi.LiveRequestAsync(teacherGrant, "/workbook-helper/v1/live/state", null, token);
            var remote = state["book"]!.AsObject(); var local = (JsonObject)remote.DeepClone();
            var target = local["sheets"]!.AsArray().First(s => s!["name"]!.GetValue<string>() == sheet)!;
            string sheetId = target["id"]!.GetValue<string>(); target["cells"]!["D2"]!["fill"] = 0x0000ff;
            string cacheRoot = Path.Combine(directory, "old-color-conflict"); Directory.CreateDirectory(cacheRoot);
            string cache = Path.Combine(cacheRoot, pupilGrant.WorkbookKey + "-" + pupilGrant.Live!.ActorId + ".json");
            var pending = new JsonObject { ["id"] = Guid.NewGuid().ToString("N"), ["type"] = "patch", ["changes"] = new JsonArray(new JsonObject { ["sheetId"] = sheetId, ["address"] = "D2", ["property"] = "fill", ["value"] = 0x0000ff, ["baseVersion"] = 0 }) };
            File.WriteAllText(cache, new JsonObject { ["epoch"] = pupilGrant.Live.Epoch, ["remote"] = remote.DeepClone(), ["observed"] = remote.DeepClone(), ["versions"] = state["versions"]!.DeepClone(), ["observedVersions"] = state["versions"]!.DeepClone(), ["revision"] = state["revision"]!.DeepClone(), ["structure"] = state["structureRevision"]!.DeepClone(), ["observedStructure"] = state["structureRevision"]!.DeepClone(), ["pending"] = pending, ["pendingLocal"] = local.DeepClone(), ["conflicted"] = true, ["local"] = local }.ToJsonString());
            string fullFile = await teacher.Office.ExportFileAsync(token); File.Move(fullFile, cache + ".xlsx");
            using var reopened = new LiveWorkbookClient(pupilApi, pupilGrant with { Live = pupilGrant.Live with { EventsSupported = false } }, Path.Combine(directory, "reopened-color-native"), cacheRoot);
            await reopened.InitializeAsync(pupilFile, pupilEngine, true, token);
            Ensure(!reopened.Conflicted, "The saved color conflict was restored as a permanent lock");
            await Edit(reopened, "H9", Number(999)); await reopened.TickAsync(token); await teacher.TickAsync(token);
            var value = await teacher.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "H9" }, token);
            Ensure(value["value"]!.GetValue<double>() == 999, "Reopened participant's edits did not reach the teacher");
            Ensure(Directory.GetFiles(cacheRoot, "*.color-conflict-*.xlsx").Length == 1, "Pre-resolution local copy was not retained");
            await Settle();
        });
        await Check("Conflicting native edits preserve both versions and explicit resolution converges", async () =>
        {
            await Edit(teacher, "A1", Number(20)); await Edit(teacher, "E1", Number(55)); await Edit(pupil, "A1", Number(21));
            await teacher.TickAsync(token); await pupil.TickAsync(token); Ensure(pupil.Conflicted, "Concurrent writes must produce a conflict");
            await pupil.ResolveAsync(true, token); await Settle();
            var peer = await pupil.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "E1" }, token);
            Ensure(peer["value"]!.GetValue<double>() == 55, "Conflict resolution overwrote unrelated peer changes");
        });
        await Check("A native edit made during a remote delta is retained and becomes an explicit conflict", async () =>
        {
            bool injected = false;
            faults.AfterState = async () => { injected = true; await Edit(pupil, "W2", Number(999)); };
            await Edit(teacher, "W2", Number(111)); await teacher.TickAsync(token);
            for (int round = 0; round < 12 && !injected; round++) { await pupil.PollAsync(token); await Task.Delay(30, token); }
            Ensure(injected, "The remote-delta race was not exercised");
            var local = await pupil.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "W2" }, token);
            Ensure(local["value"]!.GetValue<double>() == 999, "A remote delta overwrote a concurrent unsubmitted native edit");
            for (int round = 0; round < 3 && !pupil.Conflicted; round++) await pupil.TickAsync(token);
            Ensure(pupil.Conflicted, "A skipped remote property lost its original conflict version");
            await pupil.ResolveAsync(true, token); await Settle();
            local = await teacher.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "W2" }, token);
            Ensure(local["value"]!.GetValue<double>() == 999, "Explicit resolution did not converge after a skipped delta");
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
        await Check("Local scroll, zoom and selection survive idle snapshot exports", async () =>
        {
            foreach (var client in new[] { teacher, pupil })
            {
                await client.Office.CommandAsync(new() { ["type"] = "select", ["sheetName"] = sheet, ["ranges"] = new JsonArray(new JsonArray(0,0,0,0)) }, token);
                await client.Office.CommandAsync(new() { ["type"] = "view", ["zoom"] = 130, ["row"] = 15000, ["column"] = 3 }, token);
                var before = await client.Office.CommandAsync(new() { ["type"] = "viewport" }, token);
                var selection = (await client.Office.CommandAsync(new() { ["type"] = "pulse" }, token))["selection"]!.DeepClone();
                for (int i = 0; i < 4; i++) await client.TickAsync(token);
                var after = await client.Office.CommandAsync(new() { ["type"] = "viewport" }, token);
                Ensure(JsonNode.DeepEquals(before, after), "Snapshot scrolled the native window: " + before + " / " + after);
                Ensure(JsonNode.DeepEquals(selection, (await client.Office.CommandAsync(new() { ["type"] = "pulse" }, token))["selection"]), "Snapshot changed the native selection");
            }
        });
        await Check("Sorting ten thousand rows in either office engine preserves row pairs and each participant's own viewport", async () =>
        {
            await pupil.Office.CommandAsync(new() { ["type"] = "load-filter-data", ["sheetName"] = sheet, ["count"] = 10000 }, token); await Settle();
            var before = await teacher.Office.CommandAsync(new() { ["type"] = "viewport" }, token);
            await pupil.Office.CommandAsync(new() { ["type"] = "sort", ["sheetName"] = sheet, ["range"] = "AF1:AH10001", ["column"] = 0, ["ascending"] = true }, token);
            await Settle();
            Ensure((await teacher.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "AF2" }, token))["value"]!.GetValue<double>() == 1, "Pupil's sort did not reach the teacher");
            Ensure((await teacher.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "AH2" }, token))["value"]!.GetValue<double>() == 10, "Sorting separated row pairs");
            Ensure(JsonNode.DeepEquals(before, await teacher.Office.CommandAsync(new() { ["type"] = "viewport" }, token)), "Remote sort moved the teacher's viewport");
            await teacher.Office.CommandAsync(new() { ["type"] = "sort", ["sheetName"] = sheet, ["range"] = "AF1:AH10001", ["column"] = 0, ["ascending"] = false }, token); await Settle();
            Ensure((await pupil.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "AF2" }, token))["value"]!.GetValue<double>() == 10000, "Teacher's sort did not reach the pupil");
        });
        await Check("Filter values, numeric conditions and clearing filters synchronize without sharing scroll or zoom", async () =>
        {
            async Task Filter(LiveWorkbookClient client, int column, params (string Operator, string Value)[] tests)
            {
                var predicates = new JsonArray(tests.Select(test => (JsonNode)new JsonObject { ["operator"] = test.Operator, ["value"] = test.Value }).ToArray());
                await client.Office.CommandAsync(new() { ["type"] = "filter", ["sheetName"] = sheet, ["filter"] = new JsonObject { ["range"] = "AF1:AH10001", ["columns"] = new JsonArray(new JsonObject { ["column"] = column, ["and"] = false, ["tests"] = predicates }), ["hiddenRows"] = new JsonArray() } }, token);
            }
            var before = await teacher.Office.CommandAsync(new() { ["type"] = "viewport" }, token);
            await Filter(pupil, 0, ("greaterThanOrEqual", "9997")); await Settle();
            var snapshot = await teacher.Office.SnapshotAsync(token);
            try
            {
                var hidden = snapshot.Book["sheets"]![0]!["filter"]!["hiddenRows"]!.AsArray();
                Ensure(hidden.Sum(pair => pair![1]!.GetValue<int>() - pair[0]!.GetValue<int>() + 1) == 9996, "Numeric filter did not leave exactly four data rows visible: " + hidden);
            }
            finally { File.Delete(snapshot.File); }
            Ensure(JsonNode.DeepEquals(before, await teacher.Office.CommandAsync(new() { ["type"] = "viewport" }, token)), "Filter moved the local viewport");
            await Filter(teacher, 1, ("equal", "1"), ("equal", "2")); await Settle();
            snapshot = await pupil.Office.SnapshotAsync(token);
            try { Ensure(snapshot.Book["sheets"]![0]!["filter"]!["hiddenRows"]!.AsArray().Sum(pair => pair![1]!.GetValue<int>() - pair[0]!.GetValue<int>() + 1) == 3334, "Multi-value filter did not retain both values"); }
            finally { File.Delete(snapshot.File); }
            await pupil.Office.CommandAsync(new() { ["type"] = "filter", ["sheetName"] = sheet, ["filter"] = new JsonObject
            {
                ["range"] = "AF1:AH10001", ["hiddenRows"] = new JsonArray(), ["columns"] = new JsonArray(
                    new JsonObject { ["column"] = 0, ["and"] = true, ["tests"] = new JsonArray(new JsonObject { ["operator"] = "greaterThanOrEqual", ["value"] = "9997" }, new JsonObject { ["operator"] = "lessThanOrEqual", ["value"] = "9999" }) },
                    new JsonObject { ["column"] = 1, ["and"] = false, ["tests"] = new JsonArray(new JsonObject { ["operator"] = "equal", ["value"] = "1" }, new JsonObject { ["operator"] = "equal", ["value"] = "2" }) })
            } }, token); await Settle();
            snapshot = await teacher.Office.SnapshotAsync(token);
            try { Ensure(snapshot.Book["sheets"]![0]!["filter"]!["hiddenRows"]!.AsArray().Sum(pair => pair![1]!.GetValue<int>() - pair[0]!.GetValue<int>() + 1) == 9998, "Combined numeric AND / checklist OR filter did not leave exactly two rows"); }
            finally { File.Delete(snapshot.File); }
            await pupil.Office.CommandAsync(new() { ["type"] = "filter", ["sheetName"] = sheet, ["filter"] = null }, token); await Settle();
            snapshot = await teacher.Office.SnapshotAsync(token);
            try { Ensure(snapshot.Book["sheets"]![0]!["filter"] is null, "Clearing a filter did not restore all rows"); }
            finally { File.Delete(snapshot.File); }
        });
        await Check("A single cell in a thirty-thousand-cell workbook arrives without a receiver-side full export", async () =>
        {
            for (int round = 0; round < 3; round++)
            {
                await teacher.Office.CommandAsync(new() { ["type"] = "select", ["sheetName"] = sheet, ["ranges"] = new JsonArray(new JsonArray(1,34,1,34)) }, token);
                await teacher.PollAsync(token); await pupil.PollAsync(token);
                long before = pupil.Office.SnapshotCount, senderBefore = teacher.Office.SnapshotCount; var timer = Stopwatch.StartNew();
                var timings = new System.Collections.Concurrent.ConcurrentDictionary<string, double>();
                teacher.Timing = (stage, ms) => timings.AddOrUpdate("sender/" + stage, ms, (_, prior) => prior + ms);
                pupil.Timing = (stage, ms) => timings.AddOrUpdate("recipient/" + stage, ms, (_, prior) => prior + ms);
                await Edit(teacher, "AI2", Number(700 + round));
                while (true)
                {
                    await Task.WhenAll(teacher.PollAsync(token), pupil.PollAsync(token));
                    var value = await pupil.Office.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "AI2" }, token);
                    if (value["value"]?.GetValue<double>() == 700 + round) break;
                    Ensure(timer.ElapsedMilliseconds < 4000, "A single native edit was too slow: " + timer.ElapsedMilliseconds + "ms");
                    await Task.Delay(50, token);
                }
                Ensure(pupil.Office.SnapshotCount - before <= 1, "A remote cell edit repeatedly exported the full recipient workbook");
                teacher.Timing = pupil.Timing = null;
                checks.Add(new JsonObject { ["name"] = "large-book-cell-latency", ["ms"] = timer.ElapsedMilliseconds, ["senderExports"] = teacher.Office.SnapshotCount - senderBefore, ["recipientExports"] = pupil.Office.SnapshotCount - before, ["timings"] = System.Text.Json.JsonSerializer.SerializeToNode(timings.ToDictionary(entry => entry.Key, entry => Math.Round(entry.Value, 2))), ["passed"] = true });
            }
        });
        await Check("Ctrl-S equivalent stores the merged binary on the board and in notes", async () =>
        {
            teacher.RequestSave(); await teacher.TickAsync(token);
            var state = await teacherApi.LiveRequestAsync(teacherGrant, "/workbook-helper/v1/live/state", null, token);
            Ensure(state["revision"]!.GetValue<long>() == state["checkpointRevision"]!.GetValue<long>(), "Shared checkpoint has not caught up");
        });
        await Check("Pending changes recover after a helper restart", async () =>
        {
            await pupil.Office.CommandAsync(new() { ["type"] = "select", ["sheetName"] = sheet, ["ranges"] = new JsonArray(new JsonArray(1,15,1,15)) }, token);
            await pupil.PollAsync(token);
            await Edit(pupil, "P2", Number(12345)); faults.BeforeSync = true;
            try { await pupil.PollAsync(token); throw new InvalidOperationException("Expected offline edit before restart"); }
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
        await Check("A disconnected office bridge cannot publish a stale snapshot and can be reopened", async () =>
        {
            await teacher.Office.CommandAsync(new() { ["type"] = "save" }, token);
            string local = teacher.Office.LocalPath;
            try
            {
                // This closes only the isolated fixture's native office bridge.
                await teacher.Office.CommandAsync(new() { ["type"] = "close" }, token);
                throw new InvalidOperationException("Expected a closed bridge");
            }
            catch (LiveOfficeDisconnectedException) { }
            Ensure(teacher.Office.Closed && File.Exists(local), "A disconnected bridge must be replaceable and keep its local file");
            try
            {
                await teacher.Office.SnapshotAsync(token);
                throw new InvalidOperationException("A stale local file must not masquerade as a current snapshot");
            }
            catch (LiveOfficeDisconnectedException) { }
            using var reopened = await LiveOfficeProcess.OpenAsync(local, Path.Combine(directory, "reopened"), teacherEngine, hidden, token);
            var value = await reopened.CommandAsync(new() { ["type"] = "evaluate", ["sheetName"] = sheet, ["address"] = "R20000" }, token);
            Ensure(value["value"]!.GetValue<double>() == 20000, "Reopening lost the saved native workbook");
        });
    }
    private sealed class ConnectionFaults : DelegatingHandler
    {
        public bool BeforeSync, AfterSync;
        public Func<Task>? AfterState;
        public ConnectionFaults() : base(new HttpClientHandler { AllowAutoRedirect = false }) { }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            bool sync = request.RequestUri!.AbsolutePath.EndsWith("/live/sync", StringComparison.Ordinal);
            if (sync && BeforeSync) { BeforeSync = false; throw new HttpRequestException("Injected offline connection"); }
            var response = await base.SendAsync(request, token);
            if (request.RequestUri.AbsolutePath.EndsWith("/live/state", StringComparison.Ordinal) && AfterState is { } callback)
            { AfterState = null; await callback(); }
            if (sync && AfterSync) { AfterSync = false; response.Dispose(); throw new HttpRequestException("Injected lost receipt"); }
            return response;
        }
    }
}

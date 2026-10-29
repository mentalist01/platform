using System.Text.Json.Nodes;

namespace IvanEge.WorkbookHelper;

// Uses the same bounded, loopback-only native fixture as LiveWorkbookCheck.
internal static class LiveWorkbookCapacityCheck
{
    internal static async Task RunAsync(JsonObject config, JsonArray checks)
    {
        var origin = new Uri(config["origin"]!.GetValue<string>());
        if (!origin.IsLoopback || origin.Scheme != "http") throw new InvalidOperationException("Capacity checks only accept a local fixture");
        string directory = Path.GetFullPath(config["directory"]!.GetValue<string>());
        Directory.CreateDirectory(directory);
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(4));
        var token = timeout.Token;
        using var api = new HelperApiClient(origin);
        var grant = await api.ExchangeAsync(config["teacherTicket"]!.GetValue<string>(), token);
        string source = Path.Combine(directory, "source" + Path.GetExtension(grant.FileName));
        await api.DownloadAsync(grant, source, token);
        using var client = new LiveWorkbookClient(api, grant, Path.Combine(directory, "native"), Path.Combine(directory, "cache"));
        Exception? capacity = null;
        bool grow = config["grow"]?.GetValue<bool>() == true;
        try
        {
            await client.InitializeAsync(source, config["teacherEngine"]!.GetValue<string>(), true, token);
            if (grow)
            {
                string sheet = client.Office.Reader.SheetNames.Values.First();
                await client.Office.CommandAsync(new() { ["type"] = "load-filter-data", ["sheetName"] = sheet, ["count"] = 90000 }, token);
                await client.TickAsync(token);
            }
        }
        catch (Exception error) when (WorkbookFallback.IsCapacityFailure(error)) { capacity = error; }
        if (capacity is null) throw new InvalidOperationException("Fixture did not exceed the live model limit");
        string nativePath = client.Office.LocalPath;
        if (config["teacherEngine"]!.GetValue<string>() == "excel")
        {
            bool busy = false;
            try { await client.Office.CommandAsync(new() { ["type"] = "fixture-busy" }, token); }
            catch (LiveOfficeBusyException) { busy = true; }
            if (!busy || client.Office.Closed) throw new InvalidOperationException("Excel's temporary busy response became a closed/error state");
            await client.Office.CommandAsync(new() { ["type"] = "pulse" }, token);
            checks.Add(new JsonObject { ["name"] = "Excel 0x800AC472 retries without closing or losing the workbook", ["ok"] = true });
        }
        var fallback = await WorkbookFallback.WatchAttachedAsync(api, grant, client.Office, capacity, token, Path.Combine(directory, "recovered"));
        using var ordinary = fallback.Session;
        client.StopLiveSynchronization();
        if (client.Office.LocalPath != nativePath || client.Office.Closed || !File.Exists(fallback.Backup))
            throw new InvalidOperationException("Transition reopened/closed the editor or lost the recovery file");
        checks.Add(new JsonObject { ["name"] = grow ? "Workbook outgrew the live model while open" : "Opened workbook with 300001 rows", ["ok"] = true });
        TaskCompletionSource saved = new(TaskCreationOptions.RunContinuationsAsynchronously);
        ordinary.StatusChanged += (_, status) =>
        {
            if (status.Kind == WorkbookStatusKind.Saved) saved.TrySetResult();
            if (status.Kind == WorkbookStatusKind.Error) saved.TrySetException(new InvalidOperationException(status.Message));
        };
        ordinary.RetryNow(); await saved.Task.WaitAsync(TimeSpan.FromSeconds(25), token);
        checks.Add(new JsonObject { ["name"] = "Whole current workbook saved automatically to the real board endpoint", ["ok"] = true });
        saved = new(TaskCreationOptions.RunContinuationsAsynchronously);
        await client.Office.CommandAsync(new() { ["type"] = "edit", ["changes"] = new JsonArray(new JsonObject {
            ["sheetName"] = "Data", ["address"] = "B300002", ["property"] = "content",
            ["value"] = new JsonObject { ["kind"] = "number", ["value"] = 987654321 } }) }, token);
        await client.Office.CommandAsync(new() { ["type"] = "save" }, token);
        // No RetryNow here: saving natively must wake the actual file watcher.
        await saved.Task.WaitAsync(TimeSpan.FromSeconds(25), token);
        checks.Add(new JsonObject { ["name"] = "Next Ctrl+S was detected and uploaded without reopening or manual helper action", ["ok"] = true });
        var pulse = await client.Office.CommandAsync(new() { ["type"] = "pulse" }, token);
        if (client.Office.Closed) throw new InvalidOperationException("Editor unexpectedly closed");
        using var savedFile = await StableFileSnapshot.CaptureAsync(client.Office.LocalPath, TimeSpan.FromSeconds(10), token);
        config["savedHash"] = savedFile.ContentHash;
        config["backup"] = fallback.Backup;
        File.WriteAllText(config["result"]!.GetValue<string>(), config.ToJsonString());
    }
}

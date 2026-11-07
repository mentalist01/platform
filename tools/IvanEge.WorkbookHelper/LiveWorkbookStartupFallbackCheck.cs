using System.Net;
using System.Text.Json.Nodes;

namespace IvanEge.WorkbookHelper;

// A native editor and real loopback platform API: fail after the workbook
// opened, preserve its unsaved edits, then exercise the actual autosave watcher.
internal static class LiveWorkbookStartupFallbackCheck
{
    internal static async Task RunAsync(JsonObject config, JsonArray checks)
    {
        var origin = new Uri(config["origin"]!.GetValue<string>());
        if (!origin.IsLoopback || origin.Scheme != "http") throw new InvalidOperationException("Startup checks only accept a local fixture");
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(2));
        var token = timeout.Token;
        string directory = Path.GetFullPath(config["directory"]!.GetValue<string>());
        Directory.CreateDirectory(directory);
        using var monitor = new UploadMonitor();
        using var api = new HelperApiClient(origin, monitor);
        var grant = await api.ExchangeAsync(config["teacherTicket"]!.GetValue<string>(), token);
        string source = Path.Combine(directory, "source" + Path.GetExtension(grant.FileName));
        await api.DownloadAsync(grant, source, token);
        using var office = await LiveOfficeProcess.OpenAsync(source, Path.Combine(directory,"native"), config["teacherEngine"]!.GetValue<string>(), true, token, origin, borders:true, formatting:true, columns:true);
        var initial = await office.SnapshotAsync(token);
        string nativePath = office.LocalPath;
        string sheet = initial.Book["sheets"]![0]!["name"]!.GetValue<string>(); File.Delete(initial.File);
        await office.CommandAsync(new() { ["type"]="edit", ["changes"]=new JsonArray(new JsonObject {
            ["sheetName"]=sheet,["address"]="B2",["property"]="content",["value"]=new JsonObject{["kind"]="number",["value"]=12345} }) },token);
        await office.CommandAsync(new(){["type"]="fixture-fail-snapshot"},token);
        Exception? failure=null;
        try { await office.SnapshotAsync(token); }
        catch (InvalidOperationException error) { failure=error; }
        if (failure is null || office.Closed) throw new InvalidOperationException("Did not reproduce post-open initialization failure");
        var diagnostic=WorkbookOpenFailure.Diagnostic(failure,config["teacherEngine"]!.GetValue<string>());
        if (!diagnostic["stage"]!.GetValue<string>().Contains("snapshot")) throw new InvalidOperationException("Native command missing from diagnostics");
        var fallback = await WorkbookFallback.WatchAttachedAsync(api,grant,office,failure,token,Path.Combine(directory,"recovered"),startupFailure:true);
        using var ordinary=fallback.Session;
        if (office.Closed || !string.Equals(Path.GetFullPath(office.LocalPath),Path.GetFullPath(nativePath),StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Fallback closed or reopened the native workbook");
        var backup=new LiveWorkbookBook().Read(fallback.Backup);
        if (backup["sheets"]![0]!["cells"]!["B2"]!["content"]!["value"]!.GetValue<double>()!=12345) throw new InvalidOperationException("Backup lost unsaved native edits");
        checks.Add(new JsonObject(){["name"]="Post-open snapshot failure falls back without closing the editor or losing unsaved edits",["ok"]=true});
        ordinary.RetryNow(); await Task.Delay(1800,token);
        if(monitor.Uploads!=0) throw new InvalidOperationException("Fallback published an incomplete/stale file without Ctrl+S");
        checks.Add(new JsonObject(){["name"]="Entering fallback does not overwrite the board before the user saves",["ok"]=true});
        TaskCompletionSource saved=new(TaskCreationOptions.RunContinuationsAsynchronously);
        ordinary.StatusChanged+=(_,status)=>{if(status.Kind==WorkbookStatusKind.Saved)saved.TrySetResult();};
        await office.CommandAsync(new(){["type"]="save-file"},token);
        await saved.Task.WaitAsync(TimeSpan.FromSeconds(25),token);
        if(monitor.Uploads<1) throw new InvalidOperationException("Native Ctrl+S did not upload the workbook");
        if((await office.CommandAsync(new(){["type"]="file-status"},token))["closed"]!.GetValue<bool>())throw new InvalidOperationException("Editor closed after autosaving");
        using var snapshot=await StableFileSnapshot.CaptureAsync(nativePath,TimeSpan.FromSeconds(5),token);
        config["savedHash"]=snapshot.ContentHash;
        checks.Add(new JsonObject(){["name"]="Next native save automatically uploads the complete workbook to the real board endpoint",["ok"]=true});
        File.WriteAllText(config["result"]!.GetValue<string>(),config.ToJsonString());
    }
    private sealed class UploadMonitor : DelegatingHandler
    {
        public int Uploads;
        public UploadMonitor():base(new HttpClientHandler{AllowAutoRedirect=false}){}
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token)
        {
            if(request.Method==HttpMethod.Put&&request.RequestUri!.AbsolutePath=="/workbook-helper/v1/content")Interlocked.Increment(ref Uploads);
            return base.SendAsync(request,token);
        }
    }
}

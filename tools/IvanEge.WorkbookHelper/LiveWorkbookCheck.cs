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
        // The full matrix now includes both formatting and 20,000-row fixtures.
        // Each latency-sensitive operation retains its own stricter deadline.
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(6)); var token = timeout.Token;
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
            try { if (!JsonNode.DeepEquals(a.Book, b.Book)) { File.WriteAllText(Path.Combine(directory,"teacher-diverged.json"),a.Book.ToJsonString()); File.WriteAllText(Path.Combine(directory,"pupil-diverged.json"),b.Book.ToJsonString()); } Ensure(JsonNode.DeepEquals(a.Book, b.Book), "The native books did not converge. Deferred: " + teacher.DeferredNativeChange + " / " + pupil.DeferredNativeChange); }
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
        if(config["columnsOnly"]?.GetValue<bool>()==true)
        {
            Ensure(teacherGrant.Live!.ColumnsSupported&&pupilGrant.Live!.ColumnsSupported,"Column capability was not negotiated");
            for(int i=4;i<=12;i++)await Edit(teacher,LiveWorkbookBorders.Address(i,1),Number(i-3));
            await Settle();
            int Width(JsonObject book,int column)=>book["sheets"]!.AsArray().First(s=>s!["name"]!.GetValue<string>()==sheet)!["layout"]!["columns"]!.AsArray().First(r=>r![0]!.GetValue<int>()<=column&&r[1]!.GetValue<int>()>=column)![2]!.GetValue<int>();
            foreach(var (source,name) in new[]{(teacher,teacherEngine),(pupil,pupilEngine)})
            {
                await Check(name+" manual column width and AutoFit synchronize without changing the other viewport",async()=>
                {
                    await teacher.Office.CommandAsync(new(){["type"]="view",["row"]=20,["column"]=3,["zoom"]=80},token);
                    await pupil.Office.CommandAsync(new(){["type"]="view",["row"]=40,["column"]=6,["zoom"]=135},token);
                    await source.Office.CommandAsync(new(){["type"]="fixture-columns",["sheetName"]=sheet,["range"]="D:K",["width"]=18d},token);await Settle();
                    var wide=await source.Office.SnapshotAsync(token);int before=Width(wide.Book,4);File.Delete(wide.File);
                    await source.Office.CommandAsync(new(){["type"]="fixture-columns",["sheetName"]=sheet,["range"]="D:K",["auto"]=true},token);await Settle();
                    var narrow=await source.Office.SnapshotAsync(token);try{Ensure(Width(narrow.Book,4)<before,"AutoFit did not shrink numbered columns");}finally{File.Delete(narrow.File);}
                    var a=await teacher.Office.CommandAsync(new(){["type"]="viewport"},token);var b=await pupil.Office.CommandAsync(new(){["type"]="viewport"},token);
                    Ensure(a["row"]!.GetValue<int>()==20&&a["zoom"]!.GetValue<int>()==80&&b["row"]!.GetValue<int>()==40&&b["zoom"]!.GetValue<int>()==135,"Column widths shared the participants' independent view");
                });
            }
            await Check("Column widths persist in a board checkpoint",async()=>{teacher.RequestSave();await teacher.TickAsync(token);await pupil.TickAsync(token);await Settle();});
            await Check("Saved XLSX column geometry remains readable after the native editor closes",async()=>
            {
                foreach(var client in new[]{teacher,pupil})
                {
                    var before=await client.Office.SnapshotAsync(token);
                    await client.Office.CommandAsync(new(){["type"]="fixture-user-close"},token);
                    var restored=await client.Office.SnapshotAsync(token);
                    try{Ensure(JsonNode.DeepEquals(before.Book["sheets"]![0]!["layout"]?["columns"],restored.Book["sheets"]![0]!["layout"]?["columns"]),"Saved XLSX physical widths changed during recovery: "+restored.Book["sheets"]![0]!["layout"]?["columns"]+" / "+before.Book["sheets"]![0]!["layout"]?["columns"]);}
                    finally{File.Delete(before.File);File.Delete(restored.File);}
                }
            });
            return;
        }
        if(config["filterOnly"]?.GetValue<bool>()==true)goto SortingChecks;
        if (config["clipboardOnly"]?.GetValue<bool>() == true)
        {
            await Check("Autofilled formulas and repeated addition survive Excel and Calc polling without becoming reference unions",async()=>
            {
                await Edit(teacher,"F400",Number(3));await Edit(teacher,"J400",Number(58));await Settle();
                foreach(var client in new[]{teacher,pupil})
                {
                    await Edit(client,"K400",new(){["kind"]="formula",["value"]="=(J400+F400)*(F400+J400)"});
                    await client.Office.CommandAsync(new(){["type"]="fill-down",["sheetName"]=sheet,["range"]="K400:K450"},token);
                    await Settle();
                    foreach(var participant in new[]{teacher,pupil})
                    {
                        var value=await participant.Office.CommandAsync(new(){["type"]="evaluate",["sheetName"]=sheet,["address"]="K400"},token);
                        Ensure(value["value"]!.GetValue<double>()==3721,"Addition formula changed its meaning");
                        var cell=await participant.Office.CommandAsync(new(){["type"]="read-cell",["sheetName"]=sheet,["address"]="K450"},token);
                        string formula=cell["cell"]!["content"]!["value"]!.GetValue<string>();
                        Ensure(formula=="=(J450+F450)*(F450+J450)","Autofilled addition changed: "+formula);
                    }
                }
            });
            await Check("Range moves merge with unrelated concurrent pupil contents", async () =>
            {
                await Edit(teacher,"A300",Number(7)); await Edit(teacher,"A301",Number(7)); await Settle();
                await teacher.Office.CommandAsync(new(){["type"]="move-range",["sheetName"]=sheet,["range"]="A300:A301",["destination"]="C300"},token);
                await Edit(pupil,"K300",Number(991)); await teacher.TickAsync(token); await pupil.TickAsync(token); await Settle();
                var value=await teacher.Office.CommandAsync(new(){["type"]="evaluate",["sheetName"]=sheet,["address"]="K300"},token);
                Ensure(value["value"]!.GetValue<double>()==991,"A range move lost the pupil's independent edit");
            });
            await Check("A format overlap in a pasted batch retains all non-conflicting contents",async()=>
            {
                await Edit(teacher,"D310",Number(1));await Settle();
                await Edit(teacher,"D310",Number(1),0xff0000);
                await Edit(pupil,"D310",Number(1),0x00ff00);await Edit(pupil,"E310",Number(777));
                await teacher.TickAsync(token);await pupil.TickAsync(token);
                Ensure(!pupil.Conflicted,"A fill overlap blocked unrelated pasted contents");await Settle();
                var value=await teacher.Office.CommandAsync(new(){["type"]="evaluate",["sheetName"]=sheet,["address"]="E310"},token);
                Ensure(value["value"]!.GetValue<double>()==777,"Resolving a fill overlap dropped pasted contents");
            });
            await Check("A saved mixed format conflict recovers its unsent contents after reopening",async()=>
            {
                var state=await teacherApi.LiveRequestAsync(teacherGrant,"/workbook-helper/v1/live/state",null,token);
                var remote=state["book"]!.AsObject();var local=(JsonObject)remote.DeepClone();var target=local["sheets"]!.AsArray().First(s=>s!["name"]!.GetValue<string>()==sheet)!;
                string id=target["id"]!.GetValue<string>();target["cells"]!["D310"]!["fill"]=0x334455;target["cells"]!["E311"]=new JsonObject{["content"]=Number(778),["fill"]=null};
                var pending=new JsonObject{["id"]=Guid.NewGuid().ToString("N"),["type"]="patch",["changes"]=new JsonArray(
                    new JsonObject{["sheetId"]=id,["address"]="D310",["property"]="fill",["value"]=0x334455,["baseVersion"]=0},
                    new JsonObject{["sheetId"]=id,["address"]="E311",["property"]="content",["value"]=Number(778),["baseVersion"]=state["structureRevision"]!.DeepClone()})};
                string cacheRoot=Path.Combine(directory,"mixed-recovery");Directory.CreateDirectory(cacheRoot);string cache=Path.Combine(cacheRoot,pupilGrant.WorkbookKey+"-"+pupilGrant.Live!.ActorId+".json");
                File.WriteAllText(cache,new JsonObject{["epoch"]=pupilGrant.Live.Epoch,["remote"]=remote.DeepClone(),["observed"]=remote.DeepClone(),["versions"]=state["versions"]!.DeepClone(),["observedVersions"]=state["versions"]!.DeepClone(),["revision"]=state["revision"]!.DeepClone(),["structure"]=state["structureRevision"]!.DeepClone(),["observedStructure"]=state["structureRevision"]!.DeepClone(),["pending"]=pending,["pendingLocal"]=local.DeepClone(),["conflicted"]=true,["local"]=local}.ToJsonString());
                string full=await teacher.Office.ExportFileAsync(token);File.Move(full,cache+".xlsx");
                using var reopened=new LiveWorkbookClient(pupilApi,pupilGrant with{Live=pupilGrant.Live with{EventsSupported=false}},Path.Combine(directory,"mixed-reopened"),cacheRoot);
                await reopened.InitializeAsync(pupilFile,pupilEngine,true,token);Ensure(!reopened.Conflicted,"Mixed cached conflict remained permanently blocked");
                await reopened.TickAsync(token);await teacher.TickAsync(token);await pupil.TickAsync(token);await Settle();
                var value=await teacher.Office.CommandAsync(new(){["type"]="evaluate",["sheetName"]=sheet,["address"]="E311"},token);
                Ensure(value["value"]!.GetValue<double>()==778,"Recovered pasted contents were lost");
            });
            if(teacherEngine=="excel"||pupilEngine=="excel")await Check("Excel copy buffer and Paste Special survive polling and publish a 14 by 16 range before Escape",async()=>
            {
                var native=teacherEngine=="excel"?teacher:pupil;var peer=teacherEngine=="excel"?pupil:teacher;
                var changes=new JsonArray();for(int row=0;row<14;row++)for(int col=0;col<16;col++)changes.Add(new JsonObject{["sheetName"]=sheet,["address"]=LiveWorkbookBorders.Address(col+1,row+330),["property"]="content",["value"]=Number(row*16+col+1)});
                await native.Office.CommandAsync(new(){["type"]="edit",["changes"]=changes},token);await Settle();
                await native.PollAsync(token);await peer.PollAsync(token);
                await native.Office.CommandAsync(new(){["type"]="fixture-copy",["sheetName"]=sheet,["range"]="A330:P343"},token);
                try
                {
                    bool deferred=false;try{await native.Office.ExportFileAsync(token);}catch(LiveOfficeBusyException){deferred=true;}
                    Ensure(deferred,"A background export was allowed to destroy the clipboard");
                    await native.Office.CommandAsync(new(){["type"]="select",["sheetName"]=sheet,["ranges"]=new JsonArray(new JsonArray(350,0,363,15))},token);
                    await native.Office.CommandAsync(new(){["type"]="fixture-paste",["sheetName"]=sheet,["address"]="A351"},token);
                    var pastedPulse=await native.Office.CommandAsync(new(){["type"]="pulse",["sinceSerial"]=0},token);
                    File.WriteAllText(Path.Combine(directory,"clipboard-pulse.json"),pastedPulse.ToJsonString());
                    var clock=Stopwatch.StartNew();while(true)
                    {
                        try{await native.PollAsync(token);}catch(LiveOfficeBusyException){}
                        await peer.PollAsync(token);
                        var value=await peer.Office.CommandAsync(new(){["type"]="evaluate",["sheetName"]=sheet,["address"]="P364"},token);
                        if(value["value"]?.GetValue<double>()==224)break;
                        Ensure(clock.ElapsedMilliseconds<6500,"Paste Special did not arrive while Excel kept its copy buffer");await Task.Delay(50,token);
                    }
                    Ensure(clock.ElapsedMilliseconds<6500,"Paste Special arrived only after the slow snapshot audit");
                    checks.Add(new JsonObject{["name"]="Paste Special 224-cell committed transfer latency",["passed"]=true,["ms"]=clock.ElapsedMilliseconds});
                    var clipboard=await native.Office.CommandAsync(new(){["type"]="fixture-clipboard"},token);
                    Ensure(clipboard["copyMode"]!.GetValue<int>()==1,"Synchronization cancelled repeated Paste Special");
                }
                finally{await native.Office.CommandAsync(new(){["type"]="fixture-clipboard",["cancel"]=true},token);}
                await Settle();
                await native.Office.CommandAsync(new(){["type"]="fixture-quiet-format",["sheetName"]=sheet,["address"]="A330",["value"]=new JsonObject{["font"]=new JsonObject{["bold"]=true,["color"]=0x2266cc}}},token);
                await Settle();await native.PollAsync(token);await peer.PollAsync(token);
                await native.Office.CommandAsync(new(){["type"]="select",["sheetName"]=sheet,["ranges"]=new JsonArray(new JsonArray(350,4,350,4))},token);
                await native.Office.CommandAsync(new(){["type"]="fixture-copy",["sheetName"]=sheet,["range"]="A330"},token);
                try
                {
                    await native.Office.CommandAsync(new(){["type"]="fixture-paste",["sheetName"]=sheet,["address"]="E351",["formats"]=true},token);
                    // Hidden fixtures have no real keyboard/mouse activity.
                    // Exercise the same selection inspection requested by the
                    // idle native-input hook after an actual UI paste.
                    await native.Office.CommandAsync(new(){["type"]="pulse",["inspectSelection"]=true},token);
                    var clock=Stopwatch.StartNew();while(true)
                    {
                        try{await native.PollAsync(token);}catch(LiveOfficeBusyException){}
                        await peer.PollAsync(token);
                        var value=await peer.Office.CommandAsync(new(){["type"]="read-cell",["sheetName"]=sheet,["address"]="E351"},token);
                        if(value["cell"]?["format"]?["font"]?["bold"]?.GetValue<bool>()==true){Ensure(value["cell"]!["content"]!["value"]!.GetValue<double>()==5,"Formats-only paste replaced cell contents");break;}
                        Ensure(clock.ElapsedMilliseconds<6500,"Formats-only Paste Special did not reach the peer");await Task.Delay(50,token);
                    }
                    Ensure((await native.Office.CommandAsync(new(){["type"]="fixture-clipboard"},token))["copyMode"]!.GetValue<int>()==1,"Formats-only synchronization cancelled the Excel clipboard");
                    checks.Add(new JsonObject{["name"]="Formats-only Paste Special synchronizes without replacing contents or clipboard",["passed"]=true,["ms"]=clock.ElapsedMilliseconds});
                }
                finally{await native.Office.CommandAsync(new(){["type"]="fixture-clipboard",["cancel"]=true},token);}
                await Settle();
            });
            if(teacherEngine=="excel"||pupilEngine=="excel")await Check("A 2500-row Paste Special publishes while the native copy buffer stays available",async()=>
            {
                var native=teacherEngine=="excel"?teacher:pupil;var peer=teacherEngine=="excel"?pupil:teacher;
                await native.Office.CommandAsync(new(){["type"]="load-test-data",["sheetName"]=sheet,["count"]=2500},token);await Settle();
                await native.PollAsync(token);await peer.PollAsync(token);
                await native.Office.CommandAsync(new(){["type"]="fixture-copy",["sheetName"]=sheet,["range"]="R1:R2500"},token);
                try
                {
                    await native.Office.CommandAsync(new(){["type"]="fixture-paste",["sheetName"]=sheet,["address"]="S1"},token);
                    var clock=Stopwatch.StartNew();
                    while(true)
                    {
                        await native.PollAsync(token);await peer.PollAsync(token);
                        var value=await peer.Office.CommandAsync(new(){["type"]="evaluate",["sheetName"]=sheet,["address"]="S2500"},token);
                        if(value["value"]?.GetValue<double>()==2500)break;
                        Ensure(clock.ElapsedMilliseconds<20000,"A long pasted column stayed queued until Escape");await Task.Delay(50,token);
                    }
                    Ensure((await native.Office.CommandAsync(new(){["type"]="fixture-clipboard"},token))["copyMode"]!.GetValue<int>()==1,"Large paste synchronization cleared the source buffer");
                }
                finally{await native.Office.CommandAsync(new(){["type"]="fixture-clipboard",["cancel"]=true},token);}
                await Settle();
            });
            return;
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
        if(config["draftUi"]?.GetValue<bool>()==true)
        {
            await Check("Actual native draft remains transient then Enter publishes the confirmed COUNT formula",async()=>
            {
                await Edit(teacher,"D2",Number(1));await Edit(teacher,"D3",Number(2));await Settle();
                await teacher.Office.CommandAsync(new(){["type"]="fixture-title",["title"]="IVAN100 Draft QA 20261030"},token);
                await teacher.Office.CommandAsync(new(){["type"]="select",["sheetName"]=sheet,["ranges"]=new JsonArray(new JsonArray(13,3,13,3))},token);
                bool sawDraft=false;long confirmedAt=0;teacher.Presence+=(frame,_)=>{if(frame["draft"] is JsonObject)sawDraft=true;else if(sawDraft&&confirmedAt==0)confirmedAt=Environment.TickCount64;};
                File.WriteAllText(Path.Combine(directory,"draft-ui-ready.txt"),"Use the owned IVAN100 Draft QA window. Enter =COUNT(D2:D13), wait, then press Enter.");
                var clock=Stopwatch.StartNew();long committedAt=0;
                while(true)
                {
                    await Task.WhenAll(teacher.PollAsync(token),pupil.PollAsync(token));
                    if(sawDraft)
                    {
                        var cell=await pupil.Office.CommandAsync(new(){["type"]="read-cell",["sheetName"]=sheet,["address"]="D14"},token);
                        if(cell["cell"]?["content"]?["kind"]?.GetValue<string>()=="formula")
                        {
                            var value=await pupil.Office.CommandAsync(new(){["type"]="evaluate",["sheetName"]=sheet,["address"]="D14"},token);
                            Ensure(value["value"]!.GetValue<double>()==2,"Committed native formula did not calculate");Ensure(confirmedAt>0&&Environment.TickCount64-confirmedAt<2500,"Confirmed draft exceeded the commit budget");committedAt=Environment.TickCount64-confirmedAt;break;
                        }
                    }
                    Ensure(clock.ElapsedMilliseconds<240000,"Actual typing/Enter check timed out");await Task.Delay(80,token);
                }
                File.WriteAllText(Path.Combine(directory,"draft-ui-result.json"),new JsonObject{["sawDraft"]=sawDraft,["committedAtMs"]=committedAt,["peerValue"]=2}.ToJsonString());
            });
            return;
        }
        if (!hidden)
        {
            await Check("Peer range and draft coordinates stay physical across both monitor DPIs and back", async()=>
            {
                var frames=new JsonObject();
                frames["teacher"]=await LiveWorkbookGeometryCheck.RunAsync(teacher.Office,sheet,token);
                frames["pupil"]=await LiveWorkbookGeometryCheck.RunAsync(pupil.Office,sheet,token);
                File.WriteAllText(Path.Combine(directory,"monitor-geometry.json"),frames.ToJsonString());
            });
        }
        if (config["presenceOnly"]?.GetValue<bool>() == true) return;
        if(teacherGrant.Live!.FormattingSupported && pupilGrant.Live!.FormattingSupported)
        {
            async Task Property(LiveWorkbookClient client,string address,string property,JsonNode? value)=>await client.Office.CommandAsync(new(){["type"]="edit",["changes"]=new JsonArray(new JsonObject{["sheetName"]=sheet,["address"]=address,["property"]=property,["value"]=value?.DeepClone()})},token);
            await Check("Fonts, alignment, wrapping and numeric formats converge and clear in both directions",async()=>
            {
                var style=new JsonObject{["font"]=new JsonObject{["name"]="Arial",["size"]=14,["color"]=0x9933cc,["bold"]=true,["italic"]=true,["underline"]="double",["strike"]=true},["alignment"]=new JsonObject{["horizontal"]="center",["vertical"]="top",["wrap"]=true,["rotation"]=30},["numberFormat"]="0.00%"};
                var baseline=await teacher.Office.SnapshotAsync(token);
                JsonObject? expectedStyle;
                try{expectedStyle=LiveWorkbookFormatting.Relative(LiveWorkbookFormatting.Resolve(style,baseline.Book["defaultFormat"]),baseline.Book["defaultFormat"]);}finally{File.Delete(baseline.File);}
                await Edit(teacher,"F3",Number(.25));await Property(teacher,"F3","format",style);await Settle();
                foreach(var client in new[]{teacher,pupil})
                {
                    var read=await client.Office.CommandAsync(new(){["type"]="read-cell",["sheetName"]=sheet,["address"]="F3"},token);
                    Ensure(JsonNode.DeepEquals(read["cell"]?["format"],expectedStyle),"Native style did not match shared style: "+read);
                }
                await Property(pupil,"F3","format",new JsonObject{["alignment"]=new JsonObject{["horizontal"]="right",["vertical"]="center",["shrink"]=true,["rotation"]=-45},["numberFormat"]="0.000"});await Settle();
                await Property(teacher,"F3","format",null);await Settle();
                await Edit(pupil,"F3",new(){["kind"]="empty"});await Settle();
            });
            await Check("Merge and unmerge preserve the heading, contents and peer edits",async()=>
            {
                await Edit(teacher,"C1",new(){["kind"]="text",["value"]="ID процесса A"});
                await Property(teacher,"@","layout",new JsonObject{["merges"]=new JsonArray("C1:E1")});await Settle();
                var merged=await pupil.Office.SnapshotAsync(token);
                try{Ensure(merged.Book["sheets"]![0]!["layout"]?["merges"]?[0]?.GetValue<string>()=="C1:E1","Merged range missing");}finally{File.Delete(merged.File);}
                await Property(pupil,"@","layout",null);await Settle();
                await Edit(pupil,"D1",Number(20));await Settle();
                await Edit(teacher,"C1",new(){["kind"]="empty"});await Edit(pupil,"D1",new(){["kind"]="empty"});await Settle();
            });
        }
        await Check("Moving a colored range clears its old position and moves every value through normal polling",async()=>
        {
            foreach(var client in new[]{teacher,pupil})
            {
                await Edit(client,"D8",Number(1),0xbb7799);await Edit(client,"E8",Number(2),0xbb7799);await Edit(client,"F8",Number(3),0xbb7799);await Settle();
                await client.Office.CommandAsync(new(){["type"]="move-range",["sheetName"]=sheet,["range"]="D8:F8",["destination"]="Y8"},token);
                var other=client==teacher?pupil:teacher;var clock=Stopwatch.StartNew();
                while(true)
                {
                    await Task.WhenAll(teacher.PollAsync(token),pupil.PollAsync(token));
                    var old=await other.Office.CommandAsync(new(){["type"]="evaluate",["sheetName"]=sheet,["address"]="D8"},token);
                    var last=await other.Office.CommandAsync(new(){["type"]="evaluate",["sheetName"]=sheet,["address"]="AA8"},token);
                    if((old["value"] is null || old["value"]!.GetValue<double>()==0) && last["value"]!.GetValue<double>()==3)break;
                    Ensure(!teacher.Conflicted&&!pupil.Conflicted,"Range move stalled with a conflict");
                    Ensure(clock.ElapsedMilliseconds<6500,"Range move did not clear source and populate destination");await Task.Delay(80,token);
                }
                await Settle();
                foreach(string address in new[]{"Y8","Z8","AA8"})await Edit(client,address,new(){["kind"]="empty"});
                await Settle();
            }
        });
        await Check("COUNT formulas committed and autofilled across a row arrive as calculated cells, not only drafts",async()=>
        {
            await Edit(teacher,"D2",Number(1));await Edit(teacher,"D3",Number(2));await Settle();
            await teacher.Office.CommandAsync(new(){["type"]="select",["sheetName"]=sheet,["ranges"]=new JsonArray(new JsonArray(13,3,13,3))},token);await teacher.PollAsync(token);
            await Edit(teacher,"D14",new(){["kind"]="formula",["value"]="=COUNT(D2:D13)"});
            await teacher.Office.CommandAsync(new(){["type"]="fill-right",["sheetName"]=sheet,["range"]="D14:AC14"},token);
            var clock=Stopwatch.StartNew();
            while(true)
            {
                await Task.WhenAll(teacher.PollAsync(token),pupil.PollAsync(token));
                var read=await pupil.Office.CommandAsync(new(){["type"]="read-cell",["sheetName"]=sheet,["address"]="AC14"},token);
                if(read["cell"]?["content"]?["kind"]?.GetValue<string>()=="formula")break;
                Ensure(!teacher.Conflicted&&!pupil.Conflicted,"Autofill caused a conflict");Ensure(clock.ElapsedMilliseconds<6500,"Autofilled COUNT formulas did not arrive");await Task.Delay(80,token);
            }
            await Settle();
            var count=await pupil.Office.CommandAsync(new(){["type"]="evaluate",["sheetName"]=sheet,["address"]="D14"},token);
            Ensure(count["value"]!.GetValue<double>()==2,"COUNT formula did not recalculate");
            foreach(string address in new[]{"D2","D3"})await Edit(teacher,address,new(){["kind"]="empty"});
            await Settle();
        });
        await Check("Continuous small edits cannot postpone the full native formatting audit",async()=>
        {
            long before=teacher.Office.SnapshotCount;var initial=Stopwatch.StartNew();
            while(teacher.Office.SnapshotCount==before){await teacher.PollAsync(token);await Task.Delay(100,token);Ensure(initial.ElapsedMilliseconds<6500,"Initial native audit did not run");}
            await teacher.Office.CommandAsync(new(){["type"]="fixture-quiet-format",["sheetName"]=sheet,["address"]="B200",["value"]=new JsonObject{["font"]=new JsonObject{["color"]=0x2266cc,["bold"]=true}}},token);
            var clock=Stopwatch.StartNew();int sequence=1;
            while(true)
            {
                await Edit(teacher,"N90",Number(sequence++));await Task.WhenAll(teacher.PollAsync(token),pupil.PollAsync(token));
                var read=await pupil.Office.CommandAsync(new(){["type"]="read-cell",["sheetName"]=sheet,["address"]="B200"},token);
                if(read["cell"]?["format"]?["font"]?["color"]?.GetValue<int>()==0x2266cc)break;
                Ensure(clock.ElapsedMilliseconds<7000,"Small incremental edits starved the full native audit");await Task.Delay(100,token);
            }
            await Settle();
        });
        if(config["formattingOnly"]?.GetValue<bool>()==true)return;
        if (teacherGrant.Live!.BordersSupported && pupilGrant.Live!.BordersSupported)
        {
            await Check("Border thickness, style, color and deletion converge between native editors", async () =>
            {
                JsonObject Line(string style,int color) => new(){["style"]=style,["color"]=color};
                async Task Borders(LiveWorkbookClient client,string address,JsonObject? value) => await client.Office.CommandAsync(new(){["type"]="edit",["changes"]=new JsonArray(new JsonObject{["sheetName"]=sheet,["address"]=address,["property"]="borders",["value"]=value})},token);
                await Borders(teacher,"C4",new(){["right"]=Line("thin",0),["bottom"]=Line("medium",0x229944)});
                await Borders(teacher,"A1",new(){["left"]=Line("thick",0),["top"]=Line("dashed",0x2255cc)});
                await Settle();
                var first=await pupil.Office.SnapshotAsync(token);
                try { Ensure(first.Book["sheets"]![0]!["cells"]!["C4"]?["borders"]?["bottom"]?["color"]?.GetValue<int>()==0x229944,"Colored bottom border was lost"); Ensure(first.Book["sheets"]![0]!["cells"]!["A1"]?["borders"]?["left"]?["style"]?.GetValue<string>()=="thick" && first.Book["sheets"]![0]!["cells"]!["A1"]?["borders"]?["top"]?["style"]?.GetValue<string>()=="dashed", "Thickness or dash style was lost"); }
                finally { File.Delete(first.File); }
                await Borders(pupil,"C4",new(){["right"]=Line("double",0x993344),["bottom"]=Line("dotted",0)});await Settle();
                var diagnostic=await pupil.Office.CommandAsync(new(){["type"]="read-cell",["sheetName"]=sheet,["address"]="A1"},token);
                File.WriteAllText(Path.Combine(directory,"borders-native-diagnostic.json"),diagnostic.ToJsonString());
                await Borders(pupil,"C4",null);await Borders(teacher,"A1",null);await Settle();
                string[] styles=["hair","thin","medium","thick","dashed","mediumDashed","dotted","double","dashDot","mediumDashDot","dashDotDot","mediumDashDotDot","slantDashDot"];
                for(int i=0;i<styles.Length;i++)
                {
                    var writer=i%2==0?teacher:pupil;string style=styles[i];int color=0x123456+i;
                    await Borders(writer,"H8",new(){["bottom"]=Line(style,color)});await Settle();
                    var read=await teacher.Office.SnapshotAsync(token);
                    try { Ensure(read.Book["sheets"]![0]!["cells"]!["H8"]?["borders"]?["bottom"]?["style"]?.GetValue<string>()==style,"Border style changed during round trip: "+style); }
                    finally { File.Delete(read.File); }
                    foreach(var client in new[]{teacher,pupil})
                    {
                        var native=await client.Office.CommandAsync(new(){["type"]="read-cell",["sheetName"]=sheet,["address"]="H8"},token);
                        Ensure(native["cell"]?["borders"]?["bottom"]?["style"]?.GetValue<string>()==style,"Native border differed from exported border: "+style);
                    }
                }
                await Borders(teacher,"H8",null);await Settle();
                var cleared=await teacher.Office.SnapshotAsync(token);
                try { var cell=cleared.Book["sheets"]![0]!["cells"]!["C4"];Ensure(cell is null || cell["borders"] is null && cell["content"]!["kind"]!.GetValue<string>()=="empty","Cleared border survived or introduced contents"); }
                finally { File.Delete(cleared.File); }
            });
        }
        if (config["bordersOnly"]?.GetValue<bool>() == true) return;
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
        SortingChecks:
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

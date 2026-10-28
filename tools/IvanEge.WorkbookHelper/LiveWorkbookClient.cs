using System.Net;
using System.Text.Json.Nodes;

namespace IvanEge.WorkbookHelper;

// One serialized client per workbook. Unacknowledged commands and the complete
// native recovery copy are durable before sending; bearer tokens are never saved.
internal sealed class LiveWorkbookClient : IDisposable
{
    private readonly HelperApiClient _api;
    private readonly WorkbookGrant _grant;
    private readonly string _directory;
    private readonly string _cache;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private JsonObject _remote = new(), _observed = new(), _versions = new(), _observedVersions = new();
    private JsonObject? _pending, _pendingLocal;
    private readonly Stack<string> _undo = [], _redo = [];
    private long _revision, _structure, _observedStructure, _checkpoint, _lastWrite;
    private string _fileRevision;
    private bool _saveRequested;
    private bool _conflict;
    private JsonArray _peers = [];
    // Non-null only after observed and remote converged. Retain every touched
    // property until conditional native application succeeds; snapshots and
    // structural events invalidate the shortcut instead of guessing a delta.
    private HashSet<(string Sheet, string Address, string Property)>? _remoteChanges;
    private long _lastPresence, _lastSnapshot, _lastSerial = -1, _remoteHint = -1;
    private bool _presenceSupported = true;
    private bool _presenceWarningLogged;
    private LiveWorkbookEvents? _events;
    public event Action? WakeRequested;
    internal Action<string, double>? Timing { get; set; }
    public event Action<JsonObject, JsonArray>? Presence;
    public string? ConflictDescription { get; private set; }
    public bool Conflicted => _conflict;
    public bool ReadyForHelperUpdate => Office?.Closed == true && Paused && _pending is null && !_saveRequested && !_conflict && _checkpoint >= _revision;
    public LiveOfficeProcess Office { get; private set; } = null!;
    public event EventHandler<WorkbookStatus>? Status;
    public string LocalPath => Office?.LocalPath ?? "";
    public long Revision => _revision;
    internal bool UsesPush => _events?.Connected == true;
    internal void RestartPush() => _events?.Reconnect();
    public bool Paused { get; set; }
    public LiveWorkbookClient(HelperApiClient api, WorkbookGrant grant, string directory, string? cacheRoot = null)
    {
        _api = api; _grant = grant; _directory = directory; _fileRevision = grant.Revision;
        string identity = string.Concat(grant.WorkbookKey.Where(char.IsAsciiLetterOrDigit));
        if (identity.Length != 64 || grant.Live?.Protocol != 1 || grant.Live.ActorId.Length != 64) throw new FormatException("Некорректная привязка общей таблицы");
        string cacheDirectory = cacheRoot ?? Path.Combine(AppPaths.DataDirectory, "live-pending"); Directory.CreateDirectory(cacheDirectory);
        _cache = Path.Combine(cacheDirectory, identity + "-" + grant.Live.ActorId + ".json");
    }
    private void Publish(WorkbookStatusKind kind, string text, bool notify = false) => Status?.Invoke(this, new(kind, text, notify));
    private static JsonObject Copy(JsonObject value) => (JsonObject)value.DeepClone();
    private async Task PersistAsync(JsonObject local, string? snapshotFile, CancellationToken token)
    {
        // The caller owns the serialized workbook gate. Stream these stable
        // nodes directly instead of cloning every large book several times.
        // The same complete recovery data is still flushed before sending.
        var value = new { epoch = _grant.Live!.Epoch, remote = _remote, observed = _observed,
            versions = _versions, observedVersions = _observedVersions, revision = _revision, structure = _structure, observedStructure = _observedStructure,
            pending = _pending, pendingLocal = _pendingLocal, conflicted = _conflict,
            conflictDescription = ConflictDescription, saveRequested = _saveRequested, local };
        if (snapshotFile is not null) File.Copy(snapshotFile, _cache + ".xlsx", true);
        string temporary = _cache + ".tmp";
        await using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None, 65536, FileOptions.WriteThrough))
        { await System.Text.Json.JsonSerializer.SerializeAsync(stream, value, cancellationToken: token); stream.Flush(true); }
        File.Move(temporary, _cache, true);
    }
    private void Consume(JsonObject response)
    {
        _structure = response["structureRevision"]?.GetValue<long>() ?? 0;
        if (response["book"] is JsonObject book) { _remoteChanges = null; _remote = Copy(book); _versions = response["versions"] is JsonObject versions ? Copy(versions) : new(); }
        else if (response["events"] is JsonArray events) foreach (var item in events)
        {
            var entry = item!.AsObject(); var revision = entry["revision"]!.GetValue<long>();
            if (entry["book"] is JsonObject replacement)
            {
                _remoteChanges = null;
                _remote = Copy(replacement); _versions = new();
                // Replacement establishes a version barrier for all cells,
                // including empty ones; a per-cell map is unnecessary here.
            }
            else if (entry["filters"] is JsonArray filters)
            {
                _remoteChanges = null;
                foreach (var filter in filters)
                {
                    var sheet = _remote["sheets"]!.AsArray().First(sheet => sheet!["id"]!.GetValue<string>() == filter!["sheetId"]!.GetValue<string>())!.AsObject();
                    if (filter!["value"] is null) sheet.Remove("filter"); else sheet["filter"] = filter["value"]!.DeepClone();
                }
                _versions = new();
            }
            else foreach (var change in entry["changes"]!.AsArray())
            {
                if (_remoteChanges is not null)
                {
                    _remoteChanges.Add((change!["sheetId"]!.GetValue<string>(), change["address"]!.GetValue<string>(), change["property"]!.GetValue<string>()));
                    if (_remoteChanges.Count > 2048) _remoteChanges = null;
                }
                var sheet = _remote["sheets"]!.AsArray().First(sheet => sheet!["id"]!.GetValue<string>() == change!["sheetId"]!.GetValue<string>())!;
                var cells = sheet["cells"]!.AsObject(); string address = change!["address"]!.GetValue<string>(), property = change["property"]!.GetValue<string>();
                var cell = cells[address]?.AsObject() ?? LiveWorkbookBook.EmptyCell(); cell[property] = change["value"]?.DeepClone();
                if (cell["content"]!["kind"]!.GetValue<string>() == "empty" && cell["fill"] is null) cells.Remove(address);
                else if (cells[address] is null) cells[address] = cell;
                _versions[$"{sheet["id"]}/{address}/{property}"] = revision;
            }
        }
        _revision = response["revision"]!.GetValue<long>(); _checkpoint = response["checkpointRevision"]?.GetValue<long>() ?? _checkpoint;
        _fileRevision = response["fileRevision"]?.ToJsonString() ?? _fileRevision;
    }
    public async Task InitializeAsync(string source, string engine, bool hidden, CancellationToken token)
    {
        if (_grant.Live!.EventsSupported)
        {
            _events = new LiveWorkbookEvents(_grant);
            _events.Changed += () => WakeRequested?.Invoke();
        }
        if (!_grant.Live!.FiltersSupported) throw new InvalidOperationException("Сервер ещё не поддерживает передачу фильтров. Обновление платформы должно быть установлено перед запуском новой версии помощника.");
        var state = await _api.LiveRequestAsync(_grant, "/workbook-helper/v1/live/state", null, token);
        JsonObject? recovery = File.Exists(_cache) ? JsonNode.Parse(await File.ReadAllTextAsync(_cache, token))?.AsObject() : null;
        bool recover = recovery?["epoch"]?.GetValue<string>() == _grant.Live!.Epoch &&
            (recovery["pending"] is JsonObject || recovery["conflicted"]?.GetValue<bool>() == true);
        string openSource = source;
        if (recover && File.Exists(_cache + ".xlsx"))
        {
            // Excel rejects very long paths. The cache key deliberately has
            // two hashes; never open that long recovery filename natively.
            Directory.CreateDirectory(_directory); openSource = Path.Combine(_directory, "recovery.xlsx"); File.Copy(_cache + ".xlsx", openSource, true);
        }
        Office = await LiveOfficeProcess.OpenAsync(openSource, _directory, engine, hidden, token, _grant.Origin);
        if (state["book"] is JsonObject serverBook) Office.Reader.UseNames(serverBook);
        var snapshot = await Office.SnapshotAsync(token);
        try
        {
            if (state["initialized"]?.GetValue<bool>() != true)
                state = await _api.LiveRequestAsync(_grant, "/workbook-helper/v1/live/initialize", new() { ["sourceHash"] = _grant.ContentHash, ["book"] = snapshot.Book.DeepClone() }, token);
            Consume(state);
            if (recover)
            {
                var saved = recovery!;
                if (saved["epoch"]?.GetValue<string>() == _grant.Live!.Epoch &&
                    (saved["pending"] is JsonObject || saved["conflicted"]?.GetValue<bool>() == true))
                {
                    _remote = Copy(saved["remote"]!.AsObject()); _observed = Copy(saved["observed"]!.AsObject());
                    _versions = Copy(saved["versions"]!.AsObject()); _observedVersions = Copy(saved["observedVersions"]!.AsObject());
                    _revision = saved["revision"]!.GetValue<long>(); _structure = saved["structure"]!.GetValue<long>(); _observedStructure = saved["observedStructure"]?.GetValue<long>() ?? _structure;
                    _pending = saved["pending"] is JsonObject pending ? Copy(pending) : null;
                    _pendingLocal = saved["pendingLocal"] is JsonObject pendingLocal ? Copy(pendingLocal) : null;
                    _conflict = saved["conflicted"]?.GetValue<bool>() == true; ConflictDescription = saved["conflictDescription"]?.GetValue<string>();
                    _saveRequested = saved["saveRequested"]?.GetValue<bool>() == true;
                    await Office.CommandAsync(new() { ["type"] = "replace", ["book"] = saved["local"]!.DeepClone(), ["previous"] = snapshot.Book.DeepClone() }, token);
                    Office.Reader.UseNames(saved["local"]!.AsObject());
                    Publish(WorkbookStatusKind.Warning, "Восстанавливаю неотправленные изменения из локальной копии", true);
                    return;
                }
            }
            if (!JsonNode.DeepEquals(snapshot.Book, _remote)) await Office.CommandAsync(new() { ["type"] = "replace", ["book"] = _remote.DeepClone(), ["previous"] = snapshot.Book.DeepClone() }, token);
            Office.Reader.UseNames(_remote); _observed = Copy(_remote); _observedVersions = Copy(_versions); _observedStructure = _structure; _remoteChanges = [];
            _lastWrite = File.GetLastWriteTimeUtc(Office.LocalPath).Ticks;
            await PersistAsync(_observed, snapshot.File, token);
            Publish(WorkbookStatusKind.Watching, "Общая таблица подключена");
        }
        finally { File.Delete(snapshot.File); }
    }

    private async Task<bool> ReconcileAsync(CancellationToken token)
    {
        if (_remoteChanges is not null && _observedStructure == _structure)
        {
            var delta = LiveWorkbookBook.Differences(_observed, _remote, _observedVersions, _observedStructure, _remoteChanges);
            if (!LiveWorkbookBook.Structural(_observed, _remote, delta))
            {
                if (delta.Count > 0 && !await ApplyCellsAsync(delta, token)) return false;
                var before = _observed["sheets"]!.AsArray().ToDictionary(sheet => sheet!["id"]!.GetValue<string>(), sheet => sheet!);
                var after = _remote["sheets"]!.AsArray().ToDictionary(sheet => sheet!["id"]!.GetValue<string>(), sheet => sheet!);
                foreach (var (id, address, property) in _remoteChanges)
                {
                    var cells = before[id]["cells"]!.AsObject(); var cell = cells[address]?.AsObject() ?? LiveWorkbookBook.EmptyCell();
                    cell[property] = (after[id]["cells"]![address] ?? LiveWorkbookBook.EmptyCell())[property]?.DeepClone();
                    if (cell["content"]!["kind"]!.GetValue<string>() == "empty" && cell["fill"] is null) cells.Remove(address);
                    else if (cells[address] is null) cells[address] = cell;
                    string key = $"{id}/{address}/{property}"; _observedVersions[key] = _versions[key]?.DeepClone() ?? JsonValue.Create(_structure);
                }
                _remoteChanges.Clear(); return true;
            }
        }
        if (JsonNode.DeepEquals(_observed, _remote)) { _observedVersions = Copy(_versions); _observedStructure = _structure; _remoteChanges = []; return true; }
        if (Office.Closed) { Paused = true; Publish(WorkbookStatusKind.Warning, "Таблица закрыта. Ваши правки переданы; чтобы получить общую версию, откройте таблицу с доски.", true); return false; }
        var changes = LiveWorkbookBook.Differences(_observed, _remote, _observedVersions, _observedStructure);
        if (_observedStructure != _structure || LiveWorkbookBook.Structural(_observed, _remote, changes))
        {
            var current = await Office.SnapshotAsync(token);
            try
            {
                if (!JsonNode.DeepEquals(current.Book, _observed)) { ConflictDescription = "Другой участник изменил порядок строк или листов, пока вы редактировали таблицу. Обе версии сохранены."; _conflict = true; return false; }
                if (LiveWorkbookBook.SameSheets(_observed, _remote) && changes.Count == 0)
                {
                    var filters = new JsonArray(_remote["sheets"]!.AsArray().Select(sheet => (JsonNode)new JsonObject { ["sheetName"] = sheet!["name"]!.DeepClone(), ["value"] = sheet["filter"]?.DeepClone() }).ToArray());
                    await Office.CommandAsync(new() { ["type"] = "filters", ["filters"] = filters }, token);
                }
                else await Office.CommandAsync(new() { ["type"] = "replace", ["book"] = _remote.DeepClone(), ["previous"] = current.Book.DeepClone() }, token);
                Office.Reader.UseNames(_remote);
            }
            finally { File.Delete(current.File); }
        }
        else
        {
            if (!await ApplyCellsAsync(changes, token)) return false;
        }
        _observed = Copy(_remote); _observedVersions = Copy(_versions); _observedStructure = _structure; _remoteChanges = []; return true;
    }
    private async Task<bool> ApplyCellsAsync(JsonArray changes, CancellationToken token)
    {
        if (Office.Closed) { Paused = true; Publish(WorkbookStatusKind.Warning, "Таблица закрыта. Ваши правки переданы; чтобы получить общую версию, откройте таблицу с доски.", true); return false; }
        var native = new JsonArray(); var sheets = _observed["sheets"]!.AsArray().ToDictionary(sheet => sheet!["id"]!.GetValue<string>(), sheet => sheet!);
        foreach (var change in changes)
        {
            var sheet = sheets[change!["sheetId"]!.GetValue<string>()]; string address = change["address"]!.GetValue<string>(), property = change["property"]!.GetValue<string>();
            var expected = (sheet["cells"]![address] ?? LiveWorkbookBook.EmptyCell())[property];
            native.Add(new JsonObject { ["sheetName"] = sheet["name"]!.DeepClone(), ["address"] = address, ["property"] = property, ["value"] = change["value"]?.DeepClone(), ["expected"] = expected?.DeepClone() });
        }
        var applied = await Office.CommandAsync(new() { ["type"] = "apply", ["changes"] = native }, token);
        return applied["skipped"]?.GetValue<bool>() != true;
    }
    public async Task TickAsync(CancellationToken token, JsonObject? incrementalBook = null, IReadOnlyCollection<(string Sheet, string Address, string Property)>? touched = null)
    {
        if (Paused || _conflict || !await _gate.WaitAsync(0, token)) return;
        var clock = Timing is null ? null : System.Diagnostics.Stopwatch.StartNew();
        void Phase(string stage) { if (clock is null) return; Timing?.Invoke(stage, clock.Elapsed.TotalMilliseconds); clock.Restart(); }
        string? snapshotFile = null;
        try
        {
            var snapshot = incrementalBook is null ? await Office.SnapshotAsync(token) : (Book: incrementalBook, File: (string?)null);
            snapshotFile = snapshot.File;
            Phase("native-read");
            if (Office.Closed) _saveRequested = true;
            long stamp = File.GetLastWriteTimeUtc(Office.LocalPath).Ticks; if (_lastWrite != 0 && stamp != _lastWrite) _saveRequested = true; _lastWrite = stamp;
            var differences = touched is null ? LiveWorkbookBook.Differences(_observed, snapshot.Book, _observedVersions, _observedStructure)
                : LiveWorkbookBook.Differences(_observed, snapshot.Book, _observedVersions, _observedStructure, touched);
            if (_pending is null && (touched is null ? !JsonNode.DeepEquals(_observed, snapshot.Book) : differences.Count > 0))
            {
                bool structural = LiveWorkbookBook.Structural(_observed, snapshot.Book, differences);
                if (differences.Count > 10000 && !structural) structural = true;
                bool filtersOnly = structural && differences.Count == 0 && LiveWorkbookBook.SameSheets(_observed, snapshot.Book);
                _pending = new JsonObject { ["id"] = Guid.NewGuid().ToString("N"), ["type"] = filtersOnly ? "filter" : structural ? "replace" : "patch" };
                if (filtersOnly)
                {
                    _pending["baseRevision"] = _revision;
                    _pending["filters"] = new JsonArray(snapshot.Book["sheets"]!.AsArray().Select(sheet => (JsonNode)new JsonObject { ["sheetId"] = sheet!["id"]!.DeepClone(), ["value"] = sheet["filter"]?.DeepClone() }).ToArray());
                }
                else if (structural) { _pending["baseRevision"] = _revision; _pending["book"] = snapshot.Book.DeepClone(); }
                else _pending["changes"] = differences;
                _pendingLocal = snapshot.Book;
            }
            Phase("compare");
            if (_pending is not null) await PersistAsync(snapshot.Book, snapshot.File, token);
            Phase("recovery-before-send");
            long previousRevision = _revision; bool hadPending = _pending is not null;
            JsonObject response;
            try
            {
                response = _pending is null
                    ? await _api.LiveRequestAsync(_grant, "/workbook-helper/v1/live/state?since=" + _revision, null, token)
                    : await _api.LiveRequestAsync(_grant, "/workbook-helper/v1/live/sync", new() { ["command"] = _pending.DeepClone(), ["since"] = _revision }, token);
            }
            catch (HelperApiException error) when (error.StatusCode == HttpStatusCode.Conflict && _pending is not null)
            {
                Consume(await _api.LiveRequestAsync(_grant, "/workbook-helper/v1/live/state", null, token));
                _conflict = true; ConflictDescription = error.Message; await PersistAsync(snapshot.Book, snapshot.File, token);
                Publish(WorkbookStatusKind.Warning, "Нужно согласовать изменения таблицы", true); return;
            }
            Consume(response);
            Phase("network-and-consume");
            if (response["receipt"]?["status"]?.GetValue<string>() == "conflict")
            {
                _conflict = true; ConflictDescription = "Вы изменили те же ячейки, что и другой участник. Обе версии сохранены. Выберите, какие изменения оставить.";
                await PersistAsync(snapshot.Book, snapshot.File, token); Publish(WorkbookStatusKind.Warning, "Совпали изменения в одной ячейке", true); return;
            }
            if (_pending is not null)
            {
                string type = _pending["type"]!.GetValue<string>(), id = _pending["id"]!.GetValue<string>();
                if (type == "undo") { if (_undo.Count > 0) _undo.Pop(); _redo.Push(id); }
                else if (type == "redo") { if (_redo.Count > 0) _redo.Pop(); _undo.Push(id); }
                else if (type == "patch") { _undo.Push(id); _redo.Clear(); }
                if (type is "patch" or "replace" or "filter")
                {
                    _observed = _pendingLocal!; if (type is "replace" or "filter") _observedStructure = _structure;
                    foreach (var change in _pending["changes"]?.AsArray() ?? [])
                    { string key = $"{change!["sheetId"]}/{change["address"]}/{change["property"]}"; _observedVersions[key] = _versions[key]?.DeepClone() ?? JsonValue.Create(_structure); }
                }
                _pending = null; _pendingLocal = null;
            }
            bool applied = await ReconcileAsync(token);
            Phase("native-apply");
            // The conflict copy must contain native edits made while receiving
            // the remote structure, not the older pre-request snapshot.
            if (_conflict)
            {
                var recovery = await Office.SnapshotAsync(token);
                try { await PersistAsync(recovery.Book, recovery.File, token); } finally { File.Delete(recovery.File); }
            }
            else if (hadPending || previousRevision != _revision || _saveRequested) await PersistAsync(_observed, null, token);
            Phase("recovery-after-send");
            if (_conflict) { Publish(WorkbookStatusKind.Warning, "Нужно согласовать структуру таблицы", true); return; }
            if (_saveRequested && applied)
            {
                var common = await Office.SnapshotAsync(token);
                try
                {
                    if (JsonNode.DeepEquals(common.Book, _remote))
                    {
                        var receipt = await _api.LiveCheckpointAsync(_grant, common.File, _revision, _fileRevision, token);
                        _fileRevision = receipt.Revision; _checkpoint = _revision; _saveRequested = false;
                        if (!Office.Closed) await Office.CommandAsync(new() { ["type"] = "save" }, token);
                        _lastWrite = File.GetLastWriteTimeUtc(Office.LocalPath).Ticks;
                        if (Office.Closed) Paused = true;
                        Publish(WorkbookStatusKind.Saved, "Общая версия сохранена на доску и в конспекты");
                    }
                }
                finally { File.Delete(common.File); }
            }
            else Publish(WorkbookStatusKind.Watching, _checkpoint == _revision ? "Все изменения переданы · общая версия сохранена" : "Изменения переданы · Ctrl+S сохранит общую версию на доску");
        }
        finally { if (snapshotFile is not null) File.Delete(snapshotFile); _gate.Release(); }
    }
    public async Task PollAsync(CancellationToken token)
    {
        if (Office.Closed) { if (!Paused) await TickAsync(token); return; }
        JsonObject pulse;
        try { pulse = await Office.CommandAsync(new() { ["type"] = "pulse", ["peers"] = _peers.DeepClone(), ["sinceSerial"] = _lastSerial }, token); }
        catch (InvalidOperationException error)
        {
            if (!_presenceWarningLogged) { AppLog.Error("Native selection unavailable; cell synchronization continues", error); _presenceWarningLogged = true; }
            pulse = new() { ["serial"] = _lastSerial, ["watching"] = false, ["selection"] = null };
        }
        long now = Environment.TickCount64;
        bool localChange = pulse["serial"]?.GetValue<long>() != _lastSerial;
        // A local edit must not wait behind an optional cursor round-trip.
        // The synchronization response already includes the latest revision.
        if (_events?.Connected == true)
        {
            await _events.SendPresenceAsync(pulse["selection"], pulse["draft"], token);
            _peers = _events.Peers;
            _remoteHint = Math.Max(_remoteHint, _events.Revision);
        }
        else if (_presenceSupported && !localChange && now - _lastPresence >= 250)
        {
            _lastPresence = now;
            try
            {
                var reply = await _api.LiveRequestAsync(_grant, "/workbook-helper/v1/live/presence", new() { ["selection"] = pulse["selection"]?.DeepClone(), ["draft"] = pulse["draft"]?.DeepClone() }, token, TimeSpan.FromSeconds(2));
                _peers = reply["peers"] is JsonArray peers ? (JsonArray)peers.DeepClone() : [];
                _remoteHint = reply["revision"]?.GetValue<long>() ?? -1;
            }
            catch (HelperApiException error) when (error.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.BadRequest)
            { _presenceSupported = false; _peers = []; }
            catch (HelperApiException error) when (error.IsTransient)
            { _peers = []; _lastPresence = Environment.TickCount64 + 1500; }
        }
        Presence?.Invoke(pulse, (JsonArray)_peers.DeepClone());
        // Unconfirmed native input is only a transient preview. Never export a
        // half-entered formula or apply remote writes through the active editor.
        if (pulse["draft"] is JsonObject) return;
        if (Paused || _conflict) return;
        long serial = pulse["serial"]?.GetValue<long>() ?? -1;
        bool watching = pulse["watching"]?.GetValue<bool>() == true;
        bool nativeSaved = _lastWrite != 0 && File.GetLastWriteTimeUtc(Office.LocalPath).Ticks != _lastWrite;
        bool snapshotDue = now - _lastSnapshot >= (_presenceSupported && watching ? 5000 : 600);
        if (_pending is null && !_saveRequested && !nativeSaved && serial == _lastSerial && !snapshotDue && _presenceSupported && (_remoteHint > _revision || _events?.CheckpointRevision > _checkpoint))
        {
            // Receive cell patches without first exporting the whole native
            // workbook. Conditional native writes preserve concurrent typing;
            // sorting/filter changes still take a checked snapshot in Reconcile.
            if (await _gate.WaitAsync(0, token))
            {
                try
                {
                    Consume(await _api.LiveRequestAsync(_grant, "/workbook-helper/v1/live/state?since=" + _revision, null, token));
                    await ReconcileAsync(token);
                    if (_conflict)
                    {
                        var copy = await Office.SnapshotAsync(token);
                        try { await PersistAsync(copy.Book, copy.File, token); } finally { File.Delete(copy.File); }
                        Publish(WorkbookStatusKind.Warning, "Нужно согласовать изменения таблицы", true);
                    }
                }
                finally { _gate.Release(); }
            }
            return;
        }
        if (_pending is not null || _saveRequested || nativeSaved || serial != _lastSerial || (_presenceSupported && _remoteHint >= 0 && _remoteHint != _revision) || snapshotDue)
        {
            JsonObject? incremental = null;
            HashSet<(string Sheet, string Address, string Property)>? touched = null;
            if (_pending is null && !_saveRequested && !nativeSaved && !snapshotDue && pulse["cells"] is JsonArray edits && edits.Count is > 0 and <= 64)
            {
                incremental = Copy(_observed);
                touched = [];
                foreach (var edit in edits)
                {
                    var sheet = incremental["sheets"]!.AsArray().FirstOrDefault(sheet => sheet!["name"]!.GetValue<string>() == edit!["sheetName"]!.GetValue<string>());
                    if (sheet is null) { incremental = null; break; }
                    string address = edit!["address"]!.GetValue<string>(); var value = edit["value"]!;
                    touched.Add((sheet["id"]!.GetValue<string>(), address, "content")); touched.Add((sheet["id"]!.GetValue<string>(), address, "fill"));
                    if (value["content"]!["kind"]!.GetValue<string>() == "empty" && value["fill"] is null) sheet["cells"]!.AsObject().Remove(address);
                    else sheet["cells"]![address] = value.DeepClone();
                }
            }
            await TickAsync(token, incremental, incremental is null ? null : touched);
            _lastSerial = serial; _lastSnapshot = Environment.TickCount64; _remoteHint = Math.Max(_remoteHint, _revision);
        }
    }
    public void RequestSave() => _saveRequested = true;
    public async Task UndoAsync(bool redo, CancellationToken token)
    {
        if (_conflict || _pending is not null || !_gate.Wait(0)) return;
        try
        {
            var targets = redo ? _redo : _undo; if (targets.Count == 0) return;
            _pending = new() { ["id"] = Guid.NewGuid().ToString("N"), ["type"] = redo ? "redo" : "undo", ["targetId"] = targets.Peek() };
            _pendingLocal = Copy(_observed); await PersistAsync(_observed, null, token);
        }
        finally { _gate.Release(); }
        await TickAsync(token);
    }
    public async Task ResolveAsync(bool keepLocal, CancellationToken token)
    {
        if (!_conflict || !await _gate.WaitAsync(0, token)) return;
        try
        {
            Consume(await _api.LiveRequestAsync(_grant, "/workbook-helper/v1/live/state", null, token));
            var snapshot = await Office.SnapshotAsync(token);
            try
            {
                // Explicit conflict choices retain the complete pre-choice copy.
                File.Copy(snapshot.File, _cache + ".conflict-" + DateTime.UtcNow.Ticks + ".xlsx", false);
                if (keepLocal)
                {
                    // Rebase only OUR changes. Diffing the complete stale local
                    // book against the new remote book would undo peer edits.
                    var changes = LiveWorkbookBook.Differences(_observed, snapshot.Book, _versions, _structure);
                    bool structural = _observedStructure != _structure || _pending?["type"]?.GetValue<string>() == "replace" || LiveWorkbookBook.Structural(_observed, snapshot.Book, changes) ||
                        !LiveWorkbookBook.SameSheets(_observed, _remote);
                    _pending = new() { ["id"] = Guid.NewGuid().ToString("N"), ["type"] = structural ? "replace" : "patch" };
                    if (structural) { _pending["baseRevision"] = _revision; _pending["book"] = snapshot.Book.DeepClone(); }
                    else _pending["changes"] = changes;
                    _pendingLocal = Copy(snapshot.Book);
                    if (!structural && changes.Count == 0) _pending = null;
                }
                else
                {
                    await Office.CommandAsync(new() { ["type"] = "replace", ["book"] = _remote.DeepClone(), ["previous"] = snapshot.Book.DeepClone() }, token);
                    Office.Reader.UseNames(_remote); _observed = Copy(_remote); _observedVersions = Copy(_versions); _observedStructure = _structure; _pending = null; _pendingLocal = null;
                }
                _conflict = false; ConflictDescription = null; await PersistAsync(keepLocal ? snapshot.Book : _observed, snapshot.File, token);
            }
            finally { File.Delete(snapshot.File); }
        }
        finally { _gate.Release(); }
        await TickAsync(token);
    }
    public void Dispose() { _events?.Dispose(); Office?.Dispose(); }
}

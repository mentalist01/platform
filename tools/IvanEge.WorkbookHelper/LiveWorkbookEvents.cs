using System.Net.WebSockets;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.Json;
using System.Text.Encodings.Web;

namespace IvanEge.WorkbookHelper;

// An optional, reconnecting hint/presence channel. Durable edits still use the
// existing HTTP command journal; losing this socket cannot lose an edit.
internal sealed class LiveWorkbookEvents : IDisposable
{
    private readonly WorkbookGrant _grant;
    private readonly CancellationTokenSource _lifetime = new();
    private readonly SemaphoreSlim _sendGate = new(1, 1);
    private readonly object _peersGate = new();
    private ClientWebSocket? _socket;
    private volatile bool _connected;
    private JsonArray _peers = [];
    private long _revision = -1, _checkpoint, _receivedAt, _sentAt;
    private string? _sent;
    private static readonly JsonSerializerOptions WireJson = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    public bool Connected => _connected;
    public long Revision => Interlocked.Read(ref _revision);
    public long CheckpointRevision => Interlocked.Read(ref _checkpoint);
    public JsonArray Peers { get { lock (_peersGate) return Environment.TickCount64 - _receivedAt < 3500 ? (JsonArray)_peers.DeepClone() : []; } }
    public event Action? Changed;
    public LiveWorkbookEvents(WorkbookGrant grant) { _grant = grant; _ = RunAsync(); }
    private async Task RunAsync()
    {
        int failures = 0;
        while (!_lifetime.IsCancellationRequested)
        {
            using var socket = new ClientWebSocket();
            try
            {
                var uri = new UriBuilder(_grant.Origin) { Scheme = _grant.Origin.Scheme == "https" ? "wss" : "ws", Path = "/workbook-helper/v1/live/events", Query = "", Fragment = "" }.Uri;
                socket.Options.SetRequestHeader("Authorization", "Workbook " + _grant.Token);
                socket.Options.SetRequestHeader("User-Agent", $"IvanEgeWorkbookHelper/{HelperUpdater.CurrentVersion} (Windows)");
                socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(5);
                socket.Options.KeepAliveTimeout = TimeSpan.FromSeconds(8);
                using (var opening = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token))
                { opening.CancelAfter(TimeSpan.FromSeconds(5)); await socket.ConnectAsync(uri, opening.Token); }
                _socket = socket; _sent = null; _connected = true; failures = 0; Changed?.Invoke();
                var buffer = new byte[8192];
                while (socket.State == WebSocketState.Open)
                {
                    using var message = new MemoryStream();
                    WebSocketReceiveResult frame;
                    do
                    {
                        frame = await socket.ReceiveAsync(buffer, _lifetime.Token);
                        if (frame.MessageType != WebSocketMessageType.Text) throw new IOException("Канал таблицы закрыт.");
                        if (message.Length + frame.Count > 512 * 1024) throw new IOException("Слишком большое уведомление таблицы.");
                        message.Write(buffer, 0, frame.Count);
                    } while (!frame.EndOfMessage);
                    var value = JsonNode.Parse(message.ToArray())!.AsObject();
                    if (value["revision"] is JsonValue revision && revision.TryGetValue<long>(out long number)) Interlocked.Exchange(ref _revision, Math.Max(Revision, number));
                    if (value["checkpointRevision"] is JsonValue checkpoint && checkpoint.TryGetValue<long>(out long saved)) Interlocked.Exchange(ref _checkpoint, Math.Max(CheckpointRevision, saved));
                    if (value["peers"] is JsonArray peers) { lock (_peersGate) { _peers = (JsonArray)peers.DeepClone(); _receivedAt = Environment.TickCount64; } }
                    Changed?.Invoke();
                }
            }
            catch (Exception) { if (_lifetime.IsCancellationRequested) break; failures++; }
            finally { _connected = false; _socket = null; lock (_peersGate) _peers = []; Changed?.Invoke(); }
            try { await Task.Delay(Math.Min(10000, 1000 * Math.Max(1, failures)), _lifetime.Token); } catch (OperationCanceledException) { break; }
        }
    }
    public async Task SendPresenceAsync(JsonNode? selection, JsonNode? draft, CancellationToken token)
    {
        if (!Connected || !await _sendGate.WaitAsync(0, token)) return;
        ClientWebSocket? sending = null;
        try
        {
            var payload = new JsonObject { ["type"] = "presence", ["selection"] = selection?.DeepClone(), ["draft"] = draft?.DeepClone() };
            string message = payload.ToJsonString(WireJson);
            if (Encoding.UTF8.GetByteCount(message) > 24 * 1024 && payload["draft"] is JsonObject preview)
            {
                preview["text"] = string.Concat(preview["text"]!.GetValue<string>().EnumerateRunes().Take(512).Select(rune => rune.ToString())) + "…";
                message = payload.ToJsonString(WireJson);
            }
            long now = Environment.TickCount64;
            if (message == _sent && now - _sentAt < 1000 || now - _sentAt < 80) return;
            var bytes = Encoding.UTF8.GetBytes(message); if (bytes.Length > 24 * 1024) return;
            var socket = _socket; if (!Connected || socket is null) return;
            sending = socket;
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
            deadline.CancelAfter(TimeSpan.FromMilliseconds(500));
            await socket.SendAsync(bytes, WebSocketMessageType.Text, true, deadline.Token);
            _sent = message; _sentAt = now;
        }
        catch (Exception) when (!token.IsCancellationRequested) { _connected = false; sending?.Abort(); Changed?.Invoke(); }
        finally { _sendGate.Release(); }
    }
    internal void Reconnect() => _socket?.Abort();
    public void Dispose() { _lifetime.Cancel(); _socket?.Abort(); }
}

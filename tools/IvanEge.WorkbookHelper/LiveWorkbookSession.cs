using System.Drawing;

namespace IvanEge.WorkbookHelper;

internal sealed class LiveWorkbookSession : IDisposable
{
    private readonly CancellationTokenSource _lifetime = new();
    private readonly SemaphoreSlim _wake = new(0, 1);
    private readonly LiveWorkbookClient _client;
    private readonly LiveWorkbookWindow _window;
    private readonly LivePresenceOverlay _presence;
    private readonly SynchronizationContext _ui;
    private readonly Task _worker;
    private bool _disposed;
    private volatile bool _failed;
    private string? _fallbackPath;
    private WorkbookSession? _ordinary;
    public string LocalPath => _fallbackPath ?? _client.LocalPath;
    public bool HasSeparateFallback => _fallbackPath is not null;
    public bool IsPaused => _ordinary?.IsPaused ?? _client.Paused;
    public bool IsClosed => _failed || _disposed || _client.Office?.Closed == true;
    public bool ReadyForHelperUpdate => !_disposed && _ordinary is null && (_failed && _worker.IsCompleted && _client.Office is null || !_failed && _client.ReadyForHelperUpdate);
    public string Engine { get; private set; } = "auto";
    public System.Text.Json.Nodes.JsonArray Participants { get; private set; } = [];
    public event EventHandler<WorkbookStatus>? Status;

    public LiveWorkbookSession(HelperApiClient api, WorkbookGrant grant, string source, string? requestedEngine = null)
    {
        _ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
        string directory = OfficeCompatibility.CreateWorkspace();
        _client = new LiveWorkbookClient(api, grant, directory);
        _client.WakeRequested += Wake;
        _window = new LiveWorkbookWindow();
        _presence = new LivePresenceOverlay();
        _client.Presence += (frame, peers) => _ui.Post(_ => { if (!_disposed) { Participants = peers; _presence.Present(frame, peers); } }, null);
        _window.SaveRequested += () => { _client.RequestSave(); Wake(); };
        _window.UndoRequested += redo => voidUndo(redo);
        _window.ResolveRequested += async () =>
        {
            if (!_client.Conflicted) return;
            var choice = MessageBox.Show(_window,
                _client.ConflictDescription + "\n\nДа — оставить мою версию изменённых ячеек.\nНет — принять общую версию.\nОтмена — пока ничего не менять.\n\nПолная копия таблицы до выбора останется на компьютере.",
                "Совпали изменения таблицы", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question, MessageBoxDefaultButton.Button3);
            if (choice == DialogResult.Cancel) return;
            try { await _client.ResolveAsync(choice == DialogResult.Yes, _lifetime.Token); Wake(); }
            catch (Exception error) { Update(new(WorkbookStatusKind.Warning, error.Message)); }
        };
        _client.Status += (_, status) => Update(status);
        _worker = Task.Run(async () =>
        {
            try
            {
                Update(new(WorkbookStatusKind.Reading, "Открываю общую таблицу…"));
                string engine = LiveOfficePreference.Choose(source, requestedEngine);
                Engine = engine;
                await _client.InitializeAsync(source, engine, false, _lifetime.Token);
                int failures = 0;
                while (!_lifetime.IsCancellationRequested)
                {
                    var cycle = System.Diagnostics.Stopwatch.StartNew();
                    try { await _client.PollAsync(_lifetime.Token); failures = 0; }
                    catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { break; }
                    catch (LiveOfficeBusyException) { failures = 0; }
                    catch (LiveOfficeDisconnectedException error)
                    {
                        AppLog.Error("Shared workbook office connection failed: " + error);
                        _failed = true;
                        Update(new(WorkbookStatusKind.Error, error.Message, true));
                        break;
                    }
                    catch (HelperApiException error) when (!error.IsTransient && error.StatusCode is System.Net.HttpStatusCode.Gone or System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden)
                    {
                        _failed = true;
                        Update(new(WorkbookStatusKind.Warning, error.Message + " Локальная таблица сохранена. Нажмите «Решать» на доске ещё раз.", true));
                        break;
                    }
                    catch (Exception error) { failures++; Update(new(WorkbookStatusKind.Warning, "Синхронизация приостановлена: " + error.Message + " Локальная копия сохранена.", failures == 1)); }
                    var delay = TimeSpan.FromMilliseconds(failures == 0 ? Math.Max(40, 120 - cycle.ElapsedMilliseconds) : Math.Min(15000, 1500 * Math.Pow(2, Math.Min(failures, 4))));
                    await _wake.WaitAsync(delay, _lifetime.Token);
                }
            }
            catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { }
            catch (Exception error)
            {
                AppLog.Error("Shared workbook initialization failed: " + error);
                _failed = true;
                // No native book was attached, so there are no local or remote
                // cell edits to merge. Open a distinct copy of the downloaded
                // checkpoint; never reuse the shared grant for whole-file PUTs.
                if (_client.Office is null)
                {
                    try
                    {
                        await api.LiveRequestAsync(grant, "/workbook-helper/v1/live/fallback", WorkbookOpenFailure.Diagnostic(error, Engine, source), _lifetime.Token);
                        var copy = WorkbookFallback.CreateCopy(source, grant.Origin);
                        _ordinary = new WorkbookSession(api, grant with { Live = null }, copy, grant.ContentHash,
                            (_, _) => Task.FromResult<string?>(null));
                        _ordinary.StatusChanged += (_, status) => Update(status);
                        var opened = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                        _ui.Post(_ =>
                        {
                            if (_disposed) { opened.TrySetCanceled(); return; }
                            try { WorkbookFallback.Open(copy); _fallbackPath = copy; opened.TrySetResult(); }
                            catch (Exception openingError) { opened.TrySetException(openingError); }
                        }, null);
                        await opened.Task.WaitAsync(_lifetime.Token);
                        Update(new(WorkbookStatusKind.Warning, WorkbookFallback.Explanation + "\n\nНе удалось подключить совместный режим:\n" + error.Message, true));
                        return;
                    }
                    catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { return; }
                    catch (Exception fallbackError)
                    {
                        AppLog.Error("Ordinary workbook fallback failed", fallbackError);
                        Update(new(WorkbookStatusKind.Error, error.Message + "\n\nОбычная копия также не открылась: " + fallbackError.Message + "\nИсходный файл остался на компьютере.", true));
                        return;
                    }
                }
                try { await api.LiveRequestAsync(grant, "/workbook-helper/v1/live/diagnostics", WorkbookOpenFailure.Diagnostic(error, Engine, source), _lifetime.Token); }
                catch (Exception diagnosticError) { AppLog.Error("Could not send office startup diagnostics", diagnosticError); }
                Update(new(WorkbookStatusKind.Error, error.Message + " Исходный файл остался на компьютере. Нажмите «Решать» на доске ещё раз.", true));
            }
            finally { _client.Dispose(); _ui.Post(_ => { if (!_disposed) _presence.Hide(); }, null); }
        });
    }
    private async void voidUndo(bool redo)
    {
        try { await _client.UndoAsync(redo, _lifetime.Token); Wake(); }
        catch (Exception error) { Update(new(WorkbookStatusKind.Warning, error.Message)); }
    }
    private void Update(WorkbookStatus status)
    {
        _ui.Post(_ =>
        {
            if (_disposed) return;
            // RegisterSession subscribes after construction. Dispatching on the
            // tray thread keeps an immediate startup error from racing that subscription.
            Status?.Invoke(this, status);
            _window.UpdateStatus(status.Message, _client.Conflicted);
            if (_client.Conflicted && !_window.Visible) _window.Show();
        }, null);
    }
    public void Wake() { if (_ordinary is not null) { _ordinary.RetryNow(); return; } if (_wake.CurrentCount == 0) _wake.Release(); }
    public void SetPaused(bool paused) { if (_ordinary is not null) { _ordinary.SetPaused(paused); return; } _client.Paused = paused; Wake(); }
    public void ShowControls() => _ui.Post(_ => { if (!_disposed) { _window.Show(); _window.Activate(); } }, null);
    public async Task ActivateOfficeAsync()
    {
        if (_fallbackPath is not null) { WorkbookFallback.Open(_fallbackPath); return; }
        if (_client.Office is not null) await _client.Office.CommandAsync(new() { ["type"] = "activate" }, _lifetime.Token);
    }
    public void Dispose()
    {
        if (_disposed) return; _disposed = true; _lifetime.Cancel();
        _ordinary?.Dispose();
        _ui.Post(_ => { _window.Dispose(); _presence.Dispose(); }, null);
        // Worker closes its scoped office instance after persisting the local
        // recovery file. Never block the tray thread while office is busy.
    }
}

internal sealed class LiveWorkbookWindow : Form
{
    private readonly Label _status;
    private readonly Button _resolve;
    public event Action? SaveRequested;
    public event Action<bool>? UndoRequested;
    public event Action? ResolveRequested;
    public LiveWorkbookWindow()
    {
        Text = "Иван на сотку · Общая таблица"; Size = new Size(510, 235); MinimumSize = Size;
        StartPosition = FormStartPosition.CenterScreen; BackColor = Color.FromArgb(250, 248, 255); Font = new Font("Segoe UI", 10);
        var layout = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(18), FlowDirection = FlowDirection.TopDown, WrapContents = false };
        layout.Controls.Add(new Label { Text = "Excel ↔ LibreOffice · изменения передаются автоматически", AutoSize = true, Font = new Font(Font, FontStyle.Bold) });
        _status = new Label { Text = "Подключаем общую таблицу…", AutoSize = false, Width = 455, Height = 48 };
        layout.Controls.Add(_status);
        var buttons = new FlowLayoutPanel { AutoSize = true, WrapContents = false };
        var save = new Button { Text = "Сохранить на доску", AutoSize = true, BackColor = Color.FromArgb(124, 58, 237), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
        save.Click += (_, _) => SaveRequested?.Invoke(); buttons.Controls.Add(save);
        var undo = new Button { Text = "Отменить мою правку", AutoSize = true }; undo.Click += (_, _) => UndoRequested?.Invoke(false); buttons.Controls.Add(undo);
        var redo = new Button { Text = "Вернуть", AutoSize = true }; redo.Click += (_, _) => UndoRequested?.Invoke(true); buttons.Controls.Add(redo);
        layout.Controls.Add(buttons);
        _resolve = new Button { Text = "Согласовать совпавшие изменения", AutoSize = true, Visible = false }; _resolve.Click += (_, _) => ResolveRequested?.Invoke();
        layout.Controls.Add(_resolve); Controls.Add(layout);
        FormClosing += (_, args) => { if (args.CloseReason == CloseReason.UserClosing) { args.Cancel = true; Hide(); } };
    }
    public void UpdateStatus(string status, bool conflict) { _status.Text = status; _resolve.Visible = conflict; }
}

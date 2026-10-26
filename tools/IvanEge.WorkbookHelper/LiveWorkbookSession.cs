using System.Drawing;

namespace IvanEge.WorkbookHelper;

internal sealed class LiveWorkbookSession : IDisposable
{
    private readonly CancellationTokenSource _lifetime = new();
    private readonly SemaphoreSlim _wake = new(0, 1);
    private readonly LiveWorkbookClient _client;
    private readonly LiveWorkbookWindow _window;
    private readonly SynchronizationContext _ui;
    private readonly Task _worker;
    private bool _disposed;
    public string LocalPath => _client.LocalPath;
    public bool IsPaused => _client.Paused;
    public bool IsClosed => _client.Office?.Closed == true;
    public event EventHandler<WorkbookStatus>? Status;

    public LiveWorkbookSession(HelperApiClient api, WorkbookGrant grant, string source)
    {
        string engine = LiveWorkbookWindow.ChooseEngine();
        _ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
        string directory = Path.Combine(Path.GetDirectoryName(source)!, "Совместная работа " + Guid.NewGuid().ToString("N")[..8]);
        Directory.CreateDirectory(directory);
        _client = new LiveWorkbookClient(api, grant, directory);
        _window = new LiveWorkbookWindow();
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
        _window.Show();
        _worker = Task.Run(async () =>
        {
            try
            {
                Update(new(WorkbookStatusKind.Reading, "Открываю общую таблицу…"));
                await _client.InitializeAsync(source, engine, false, _lifetime.Token);
                int failures = 0;
                while (!_lifetime.IsCancellationRequested)
                {
                    var cycle = System.Diagnostics.Stopwatch.StartNew();
                    try { await _client.TickAsync(_lifetime.Token); failures = 0; }
                    catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { break; }
                    catch (HelperApiException error) when (!error.IsTransient && error.StatusCode is System.Net.HttpStatusCode.Gone or System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden)
                    { Update(new(WorkbookStatusKind.Warning, error.Message + " Локальная таблица сохранена.", true)); _client.Paused = true; }
                    catch (Exception error) { failures++; Update(new(WorkbookStatusKind.Warning, "Синхронизация приостановлена: " + error.Message + " Локальная копия сохранена.", failures == 1)); }
                    var delay = TimeSpan.FromMilliseconds(failures == 0 ? Math.Clamp(cycle.ElapsedMilliseconds, 900, 5000) : Math.Min(15000, 1500 * Math.Pow(2, Math.Min(failures, 4))));
                    await _wake.WaitAsync(delay, _lifetime.Token);
                }
            }
            catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { }
            catch (Exception error) { Update(new(WorkbookStatusKind.Error, error.Message + " Исходный файл остался на компьютере.", true)); }
            finally { _client.Dispose(); }
        });
    }
    private async void voidUndo(bool redo)
    {
        try { await _client.UndoAsync(redo, _lifetime.Token); Wake(); }
        catch (Exception error) { Update(new(WorkbookStatusKind.Warning, error.Message)); }
    }
    private void Update(WorkbookStatus status)
    {
        Status?.Invoke(this, status);
        _ui.Post(_ => { if (!_disposed) _window.UpdateStatus(status.Message, _client.Conflicted); }, null);
    }
    public void Wake() { if (_wake.CurrentCount == 0) _wake.Release(); }
    public void SetPaused(bool paused) { _client.Paused = paused; Wake(); }
    public void ShowControls() => _ui.Post(_ => { if (!_disposed) { _window.Show(); _window.Activate(); } }, null);
    public void Dispose()
    {
        if (_disposed) return; _disposed = true; _lifetime.Cancel();
        _ui.Post(_ => _window.Dispose(), null);
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
    public static string ChooseEngine()
    {
        using var form = new Form { Text = "Где открыть общую таблицу?", Size = new Size(420, 180), StartPosition = FormStartPosition.CenterScreen, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false };
        var title = new Label { Text = "Выберите программу на этом компьютере", Left = 20, Top = 18, Width = 370, Height = 25 };
        var excel = new Button { Text = "Microsoft Excel", Left = 20, Top = 58, Width = 175, Height = 40, DialogResult = DialogResult.Yes, Enabled = Type.GetTypeFromProgID("Excel.Application") is not null };
        bool hasCalc; try { LiveOfficeProcess.FindCalc(); hasCalc = true; } catch { hasCalc = false; }
        var calc = new Button { Text = "LibreOffice Calc", Left = 210, Top = 58, Width = 175, Height = 40, DialogResult = DialogResult.No, Enabled = hasCalc };
        form.Controls.AddRange([title, excel, calc]);
        return form.ShowDialog() switch { DialogResult.Yes => "excel", DialogResult.No => "calc", _ => throw new OperationCanceledException("Открытие общей таблицы отменено") };
    }
}

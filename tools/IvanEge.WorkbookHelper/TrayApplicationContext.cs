using System.Collections.Concurrent;
using System.Diagnostics;
using System.Drawing;

namespace IvanEge.WorkbookHelper;

internal sealed class TrayApplicationContext : ApplicationContext
{
    private const string ActivateMessage = "__activate__";
    private readonly SingleInstance _singleInstance;
    private readonly OriginTrustStore _trustStore = new();
    private readonly ConcurrentQueue<string> _incoming = new();
    private readonly ConcurrentQueue<Action> _uiActions = new();
    private readonly NotifyIcon _notifyIcon;
    private readonly ToolStripMenuItem _statusItem;
    private readonly ToolStripMenuItem _openItem;
    private readonly ToolStripMenuItem _pauseItem;
    private readonly ToolStripMenuItem _retryItem;
    private readonly ToolStripMenuItem _stopItem;
    private readonly System.Windows.Forms.Timer _queueTimer;
    private readonly Dictionary<string, WorkbookSession> _sessions = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<WorkbookSession> _sessionOrder = [];
    private WorkbookSession? _latestSession;
    private bool _processingRequest;
    private string _statusText = "Ожидание задания с платформы";
    private string _lastNotification = string.Empty;
    private DateTime _lastNotificationAt = DateTime.MinValue;

    public TrayApplicationContext(
        SingleInstance singleInstance,
        IEnumerable<string> initialRequests,
        bool notifyInstalled)
    {
        _singleInstance = singleInstance;
        foreach (var request in initialRequests) _incoming.Enqueue(request);

        _statusItem = new ToolStripMenuItem(_statusText) { Enabled = false };
        _openItem = new ToolStripMenuItem("Открыть текущую таблицу", null, (_, _) => OpenCurrentFile()) { Enabled = false };
        _pauseItem = new ToolStripMenuItem("Приостановить автосохранение", null, (_, _) => TogglePause()) { Enabled = false };
        _retryItem = new ToolStripMenuItem("Проверить и отправить сейчас", null, (_, _) => _latestSession?.RetryNow()) { Enabled = false };
        _stopItem = new ToolStripMenuItem("Остановить слежение", null, (_, _) => StopSession()) { Enabled = false };
        var clearTrustItem = new ToolStripMenuItem("Сбросить доверенные сайты", null, (_, _) => ClearTrustedOrigins());
        var exitItem = new ToolStripMenuItem("Выход", null, (_, _) => ExitThread());

        var menu = new ContextMenuStrip();
        menu.Items.AddRange(
        [
            _statusItem,
            new ToolStripSeparator(),
            _openItem,
            _pauseItem,
            _retryItem,
            _stopItem,
            new ToolStripSeparator(),
            clearTrustItem,
            exitItem
        ]);

        _notifyIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "Иван на сотку · помощник таблиц",
            ContextMenuStrip = menu,
            Visible = true
        };
        _notifyIcon.DoubleClick += (_, _) => OpenCurrentFile();
        _notifyIcon.BalloonTipClicked += (_, _) => OpenCurrentFile();

        _singleInstance.StartServer(message => _incoming.Enqueue(message));
        _queueTimer = new System.Windows.Forms.Timer { Interval = 220 };
        _queueTimer.Tick += OnQueueTick;
        _queueTimer.Start();

        if (notifyInstalled)
        {
            _uiActions.Enqueue(() => ShowNotification(
                "Помощник установлен",
                "Теперь кнопка «Решать» сможет открыть таблицу и сохранять её в конспекты.",
                ToolTipIcon.Info));
        }
    }

    private void OnQueueTick(object? sender, EventArgs args)
    {
        while (_uiActions.TryDequeue(out var action))
        {
            try
            {
                action();
            }
            catch (Exception error)
            {
                AppLog.Error("UI action failed", error);
            }
        }

        if (_processingRequest || !_incoming.TryDequeue(out var request)) return;
        if (string.Equals(request, ActivateMessage, StringComparison.Ordinal))
        {
            ShowNotification("Помощник уже запущен", _statusText, ToolTipIcon.Info);
            return;
        }
        _processingRequest = true;
        _ = HandleProtocolRequestAsync(request);
    }

    private async Task HandleProtocolRequestAsync(string rawRequest)
    {
        string? temporaryDownload = null;
        HelperApiClient? api = null;
        try
        {
            var request = ProtocolRequestParser.Parse(rawRequest);
            if (!OriginTrustPolicy.IsBuiltInTrusted(request.Origin) && !_trustStore.IsTrusted(request.Origin))
            {
                var answer = MessageBox.Show(
                    $"Разрешить платформе\n{request.Origin.GetLeftPart(UriPartial.Authority)}\n\nскачивать и автоматически сохранять рабочие таблицы?\n\nРазрешение запоминается только для этого сайта.",
                    "Доверять платформе?",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question,
                    MessageBoxDefaultButton.Button2);
                if (answer != DialogResult.Yes)
                {
                    SetStatus("Запуск отменён: сайт не получил разрешение");
                    return;
                }
                _trustStore.Trust(request.Origin);
            }

            SetStatus("Подключаюсь к платформе…");
            api = new HelperApiClient(request.Origin);
            var grant = await api.ExchangeAsync(request.Ticket, CancellationToken.None);
            if (grant.ExpiresAt is { } expiresAt && expiresAt <= DateTimeOffset.UtcNow)
            {
                throw new HelperApiException("Одноразовая ссылка уже истекла. Нажмите «Решать» ещё раз.");
            }

            var safeFileName = LocalWorkbookFiles.SanitizeFileName(grant.FileName);
            AppPaths.CleanupStaleSolutionDownloads(AppPaths.AssignmentsDirectory);
            AppPaths.CleanupStaleSolutionDownloads(AppPaths.SolutionsDirectory);
            var sourcePath = LocalWorkbookFiles.GetUniquePath(AppPaths.AssignmentsDirectory, safeFileName);
            var finalPath = LocalWorkbookFiles.GetUniquePath(AppPaths.SolutionsDirectory, safeFileName);
            temporaryDownload = Path.Combine(
                Path.GetDirectoryName(sourcePath)!,
                $".{Path.GetFileName(sourcePath)}.{Guid.NewGuid():N}.download");

            SetStatus("Скачиваю таблицу…");
            var download = await api.DownloadAsync(grant, temporaryDownload, CancellationToken.None);
            if (!string.Equals(download.ServerContentHash, download.LocalContentHash, StringComparison.OrdinalIgnoreCase))
            {
                throw new HelperApiException("Контрольная сумма скачанной таблицы не совпала. Файл не был открыт.");
            }
            File.Move(temporaryDownload, sourcePath);
            temporaryDownload = null;
            File.Copy(sourcePath, finalPath, overwrite: false);
            var markOfTheWebVerified = MarkOfTheWeb.TryApplyAndVerify(finalPath, request.Origin);
            var requiresManualMacroOpen = MarkOfTheWeb.IsMacroCapableFileName(finalPath)
                && !markOfTheWebVerified;

            var currentGrant = grant with
            {
                Revision = download.Revision,
                ContentHash = download.ServerContentHash
            };
            var nextSession = new WorkbookSession(
                api,
                currentGrant,
                finalPath,
                download.LocalContentHash,
                RequestSolutionNameAsync,
                requiresManualMacroOpen);
            api = null; // Ownership was transferred to WorkbookSession.
            nextSession.StatusChanged += OnSessionStatusChanged;
            RegisterSession(currentGrant, nextSession);
            UpdateSessionMenu();
            SetStatus($"Слежу за сохранениями · {Path.GetFileName(finalPath)}");

            if (requiresManualMacroOpen)
            {
                SetStatus($"Скачано, но требуется ручное открытие · {Path.GetFileName(finalPath)}");
                ShowMacroOpenBlockedWarning(finalPath);
                RevealFileInExplorer(finalPath);
                return;
            }

            try
            {
                OpenPath(finalPath);
                ShowNotification(
                    "Таблица готова",
                    "Файл открыт. Сохраняйте его в Excel или LibreOffice — изменения уйдут в конспекты сами.",
                    ToolTipIcon.Info);
            }
            catch (Exception openError)
            {
                AppLog.Error("Could not open workbook with the system association", openError);
                ShowNotification(
                    "Таблица скачана",
                    $"Не удалось открыть её автоматически. Файл лежит здесь: {finalPath}",
                    ToolTipIcon.Warning);
            }
        }
        catch (Exception error)
        {
            AppLog.Error("Protocol request failed", error);
            SetStatus("Не удалось открыть таблицу");
            ShowNotification("Не удалось открыть таблицу", GetFriendlyError(error), ToolTipIcon.Error);
        }
        finally
        {
            api?.Dispose();
            TryDelete(temporaryDownload);
            _processingRequest = false;
        }
    }

    private void OnSessionStatusChanged(object? sender, WorkbookStatus status)
    {
        _uiActions.Enqueue(() =>
        {
            if (sender is not WorkbookSession session || !ContainsSession(session)) return;
            SetStatus($"{session.FileName} · {status.Message}");
            UpdateSessionMenu();
            if (status.Notify)
            {
                ShowNotification(
                    status.Kind == WorkbookStatusKind.Error ? "Автосохранение требует внимания" : "Помощник таблиц",
                    $"{session.FileName}: {status.Message}",
                    status.Kind == WorkbookStatusKind.Error ? ToolTipIcon.Error : ToolTipIcon.Warning);
            }
        });
    }

    private Task<string?> RequestSolutionNameAsync(string? suggestion, CancellationToken cancellationToken)
    {
        if (cancellationToken.IsCancellationRequested)
        {
            return Task.FromCanceled<string?>(cancellationToken);
        }

        var completion = new TaskCompletionSource<string?>(TaskCreationOptions.RunContinuationsAsynchronously);
        _uiActions.Enqueue(() =>
        {
            if (cancellationToken.IsCancellationRequested)
            {
                completion.TrySetCanceled(cancellationToken);
                return;
            }

            try
            {
                using var dialog = new SolutionNameDialog(suggestion);
                _ = dialog.Handle;
                using var cancellationRegistration = cancellationToken.Register(() =>
                {
                    try
                    {
                        if (dialog.IsDisposed || !dialog.IsHandleCreated) return;
                        dialog.BeginInvoke(new Action(() =>
                        {
                            if (dialog.IsDisposed) return;
                            dialog.DialogResult = DialogResult.Cancel;
                            dialog.Close();
                        }));
                    }
                    catch (ObjectDisposedException)
                    {
                        // The dialog was already closed.
                    }
                    catch (InvalidOperationException)
                    {
                        // The dialog was already closing.
                    }
                });

                var result = dialog.ShowDialog();
                if (cancellationToken.IsCancellationRequested)
                {
                    completion.TrySetCanceled(cancellationToken);
                }
                else
                {
                    completion.TrySetResult(result == DialogResult.OK ? dialog.SolutionName : null);
                }
            }
            catch (Exception error)
            {
                completion.TrySetException(error);
            }
        });
        return completion.Task.WaitAsync(cancellationToken);
    }

    private void TogglePause()
    {
        if (_latestSession is null) return;
        _latestSession.SetPaused(!_latestSession.IsPaused);
        UpdateSessionMenu();
    }

    private void StopSession()
    {
        var session = _latestSession;
        if (session is null) return;
        RemoveSession(session, dispose: true);
        UpdateSessionMenu();
        SetStatus(_latestSession is null
            ? "Слежение остановлено"
            : $"Активных таблиц: {_sessions.Count} · {_latestSession.FileName}");
    }

    private void OpenCurrentFile()
    {
        if (_latestSession is null || !File.Exists(_latestSession.LocalPath))
        {
            ShowNotification("Помощник таблиц", _statusText, ToolTipIcon.Info);
            return;
        }
        if (_latestSession.RequiresManualMacroOpen)
        {
            ShowMacroOpenBlockedWarning(_latestSession.LocalPath);
            RevealFileInExplorer(_latestSession.LocalPath);
            return;
        }
        try
        {
            OpenPath(_latestSession.LocalPath);
        }
        catch (Exception error)
        {
            AppLog.Error("Could not reopen workbook", error);
            ShowNotification("Не удалось открыть таблицу", error.Message, ToolTipIcon.Error);
        }
    }

    private void ClearTrustedOrigins()
    {
        var answer = MessageBox.Show(
            "Забыть все сайты, которым разрешён запуск помощника? При следующем запуске разрешение будет запрошено заново.",
            "Сброс доверенных сайтов",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question,
            MessageBoxDefaultButton.Button2);
        if (answer != DialogResult.Yes) return;
        _trustStore.Clear();
        ShowNotification("Готово", "Список доверенных сайтов очищен.", ToolTipIcon.Info);
    }

    private void UpdateSessionMenu()
    {
        var active = _latestSession is not null;
        _openItem.Enabled = active;
        _pauseItem.Enabled = active;
        _retryItem.Enabled = active;
        _stopItem.Enabled = active;
        _pauseItem.Text = _latestSession?.IsPaused == true
            ? "Продолжить автосохранение"
            : "Приостановить автосохранение";
    }

    private void RegisterSession(WorkbookGrant grant, WorkbookSession session)
    {
        var key = BuildSessionKey(grant, session.LocalPath);
        if (_sessions.Remove(key, out var previous))
        {
            _sessionOrder.Remove(previous);
            previous.StatusChanged -= OnSessionStatusChanged;
            previous.Dispose();
        }
        _sessions[key] = session;
        _sessionOrder.Add(session);
        _latestSession = session;
    }

    private void RemoveSession(WorkbookSession session, bool dispose)
    {
        var entry = _sessions.FirstOrDefault(pair => ReferenceEquals(pair.Value, session));
        if (!string.IsNullOrWhiteSpace(entry.Key)) _sessions.Remove(entry.Key);
        _sessionOrder.Remove(session);
        session.StatusChanged -= OnSessionStatusChanged;
        if (dispose) session.Dispose();
        _latestSession = _sessionOrder.LastOrDefault();
    }

    private bool ContainsSession(WorkbookSession session) =>
        _sessions.Values.Any(candidate => ReferenceEquals(candidate, session));

    internal static string BuildSessionKey(WorkbookGrant grant, string localPath) =>
        $"{grant.Origin.GetLeftPart(UriPartial.Authority).TrimEnd('/').ToLowerInvariant()}\n{grant.WorkbookKey}\n{Path.GetFullPath(localPath)}";

    private void SetStatus(string message)
    {
        _statusText = string.IsNullOrWhiteSpace(message) ? "Помощник работает" : message.Trim();
        _statusItem.Text = _statusText.Length > 90 ? _statusText[..87] + "…" : _statusText;
        var tooltip = $"Иван на сотку · {_statusText}";
        _notifyIcon.Text = tooltip.Length > 63 ? tooltip[..62] : tooltip;
    }

    private void ShowNotification(string title, string message, ToolTipIcon icon)
    {
        var normalizedMessage = string.IsNullOrWhiteSpace(message) ? "Помощник работает" : message.Trim();
        var signature = $"{title}\n{normalizedMessage}";
        if (string.Equals(signature, _lastNotification, StringComparison.Ordinal)
            && DateTime.UtcNow - _lastNotificationAt < TimeSpan.FromSeconds(25))
        {
            return;
        }
        _lastNotification = signature;
        _lastNotificationAt = DateTime.UtcNow;
        _notifyIcon.ShowBalloonTip(4500, title, normalizedMessage.Length > 240 ? normalizedMessage[..237] + "…" : normalizedMessage, icon);
    }

    private static string GetFriendlyError(Exception error) => error switch
    {
        FormatException => error.Message,
        HelperApiException => error.Message,
        UnauthorizedAccessException => "Windows не дал доступ к папке с решениями.",
        IOException => "Не удалось сохранить рабочую копию. Проверьте свободное место на диске.",
        _ => "Произошла непредвиденная ошибка. Попробуйте нажать «Решать» ещё раз."
    };

    private static void OpenPath(string path)
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = path,
            UseShellExecute = true,
            WorkingDirectory = Path.GetDirectoryName(path) ?? Environment.CurrentDirectory
        });
    }

    private static void ShowMacroOpenBlockedWarning(string path)
    {
        MessageBox.Show(
            $"Windows не удалось надёжно записать защитную метку для файла с поддержкой макросов.\n\n"
            + "Поэтому помощник не открыл его автоматически. Файл не потерян и сохранён здесь:\n\n"
            + $"{path}\n\nОткрывайте его вручную только если доверяете источнику.",
            "Автоматическое открытие заблокировано",
            MessageBoxButtons.OK,
            MessageBoxIcon.Warning);
    }

    private static void RevealFileInExplorer(string path)
    {
        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = "explorer.exe",
                UseShellExecute = false,
                CreateNoWindow = true
            };
            startInfo.ArgumentList.Add($"/select,{path}");
            Process.Start(startInfo);
        }
        catch (Exception error)
        {
            AppLog.Error("Could not reveal blocked macro workbook in Explorer", error);
        }
    }

    private static void TryDelete(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return;
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch
        {
            // Best effort cleanup.
        }
    }

    protected override void ExitThreadCore()
    {
        _queueTimer.Stop();
        foreach (var session in _sessionOrder.ToArray()) RemoveSession(session, dispose: true);
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        _singleInstance.Dispose();
        base.ExitThreadCore();
    }

    public static string ActivationMessage => ActivateMessage;
}

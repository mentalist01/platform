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
    private readonly ToolStripMenuItem _controlsItem;
    private readonly ToolStripMenuItem _participantsItem;
    private readonly ToolStripMenuItem _updatesItem;
    private readonly CancellationTokenSource _updateLifetime = new();
    private StagedHelperUpdate? _pendingUpdate;
    private bool _checkingUpdate;
    private bool _manualUpdate;
    private readonly HelperUpdateLaunchGate _updateLaunch = new();
    private DateTime _nextUpdateCheck = DateTime.UtcNow.AddSeconds(5);
    private DateTime _nextUpdateApply = DateTime.MinValue;
    private readonly System.Windows.Forms.Timer _queueTimer;
    private readonly Dictionary<string, WorkbookSession> _sessions = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<WorkbookSession> _sessionOrder = [];
    private readonly ConcurrentDictionary<string, byte> _handledSaveAsCandidates = new(StringComparer.OrdinalIgnoreCase);
    private WorkbookSession? _latestSession;
    private bool _processingRequest;
    private string _statusText = "Ожидание задания с платформы";
    private string _lastNotification = string.Empty;
    private DateTime _lastNotificationAt = DateTime.MinValue;

    public TrayApplicationContext(
        SingleInstance singleInstance,
        IEnumerable<string> initialRequests,
        bool notifyInstalled,
        bool notifyUpdated = false)
    {
        _singleInstance = singleInstance;
        var requests = initialRequests.ToList();
        foreach (var request in requests) _incoming.Enqueue(request);

        _statusItem = new ToolStripMenuItem(_statusText) { Enabled = false };
        _openItem = new ToolStripMenuItem("Открыть текущую таблицу", null, (_, _) => OpenCurrentFile()) { Enabled = false };
        _pauseItem = new ToolStripMenuItem("Приостановить автосохранение", null, (_, _) => TogglePause()) { Enabled = false };
        _retryItem = new ToolStripMenuItem("Проверить и отправить сейчас", null, (_, _) => _latestSession?.RetryNow()) { Enabled = false };
        _stopItem = new ToolStripMenuItem("Остановить слежение", null, (_, _) => StopSession()) { Enabled = false };
        _controlsItem = new ToolStripMenuItem("Состояние и отмена общих правок", null, (_, _) => _latestSession?.ShowLiveControls()) { Enabled = false };
        _participantsItem = new ToolStripMenuItem("Цвета участников") { Visible = false };
        var helpItem = new ToolStripMenuItem("Как пользоваться", null, (_, _) => ShowUsageInstructions());
        _updatesItem = new ToolStripMenuItem($"Проверить обновления · {HelperUpdater.CurrentVersion.ToString(3)}", null, (_, _) => _ = CheckUpdatesAsync(true)) { Enabled = HelperUpdater.Available };
        var automaticUpdatesItem = new ToolStripMenuItem("Обновлять автоматически") { Checked = HelperUpdater.Enabled, CheckOnClick = true, Enabled = HelperUpdater.Available };
        automaticUpdatesItem.CheckedChanged += (_, _) => HelperUpdater.Enabled = automaticUpdatesItem.Checked;
        var programItem = new ToolStripMenuItem("Программа для общей таблицы");
        foreach (var (value, label) in new[] { ("auto", "Автоматически · сначала LibreOffice"), ("excel", "Microsoft Excel"), ("calc", "LibreOffice Calc") })
        {
            var option = new ToolStripMenuItem(label) { Checked = LiveOfficePreference.Preferred == value };
            option.Click += (_, _) =>
            {
                LiveOfficePreference.Preferred = value;
                foreach (ToolStripMenuItem other in programItem.DropDownItems) other.Checked = ReferenceEquals(other, option);
            };
            programItem.DropDownItems.Add(option);
        }
        var openPlatformItem = new ToolStripMenuItem("Открыть ivan100.ru", null, (_, _) => OpenPlatform());
        var clearTrustItem = new ToolStripMenuItem("Сбросить доверенные сайты", null, (_, _) => ClearTrustedOrigins());
        var exitItem = new ToolStripMenuItem("Выход", null, (_, _) => ExitThread());

        var menu = new ContextMenuStrip();
        menu.Items.AddRange(
        [
            new ToolStripMenuItem($"Версия помощника {HelperUpdater.CurrentVersion.ToString(3)}") { Enabled = false },
            _statusItem,
            new ToolStripSeparator(),
            _openItem,
            _pauseItem,
            _retryItem,
            _stopItem,
            _controlsItem,
            _participantsItem,
            new ToolStripSeparator(),
            programItem,
            _updatesItem,
            automaticUpdatesItem,
            helpItem,
            openPlatformItem,
            clearTrustItem,
            exitItem
        ]);
        menu.Opening += (_, _) => UpdateParticipantsMenu();

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
        else if (notifyUpdated)
        {
            _uiActions.Enqueue(() => ShowNotification("Помощник обновлён", $"Установлена версия {HelperUpdater.CurrentVersion.ToString(3)}. Можно продолжать работу.", ToolTipIcon.Info));
        }
        else if (requests.Count == 0)
        {
            _uiActions.Enqueue(ShowUsageInstructions);
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

        var updateAction = _updateLaunch.Next(
            automatic: HelperUpdater.Available && HelperUpdater.Enabled,
            manual: HelperUpdater.Available && _manualUpdate,
            safe: _sessionOrder.All(session => session.ReadyForHelperUpdate),
            busy: _processingRequest,
            hasWorkbookRequest: _incoming.TryPeek(out var nextRequest) && nextRequest != ActivateMessage,
            checking: _checkingUpdate,
            pending: _pendingUpdate is not null,
            applyAllowed: DateTime.UtcNow >= _nextUpdateApply);
        if (updateAction == HelperUpdateLaunchAction.Apply)
        {
            ApplyPendingUpdate();
            return;
        }
        if (updateAction == HelperUpdateLaunchAction.Check)
        {
            SetStatus("Проверяю обновления перед открытием таблицы…");
            _ = CheckUpdatesAsync(false);
            return;
        }
        if (updateAction == HelperUpdateLaunchAction.Wait) return;

        if (HelperUpdater.Available && HelperUpdater.Enabled && !_checkingUpdate && DateTime.UtcNow >= _nextUpdateCheck)
            _ = CheckUpdatesAsync(false);

        if (_processingRequest || !_incoming.TryDequeue(out var request)) return;
        if (string.Equals(request, ActivateMessage, StringComparison.Ordinal))
        {
            ShowNotification("Помощник уже запущен", _statusText, ToolTipIcon.Info);
            return;
        }
        _updateLaunch.RequestStarted();
        _processingRequest = true;
        _ = HandleProtocolRequestAsync(request);
    }

    private async Task CheckUpdatesAsync(bool manual)
    {
        if (_checkingUpdate || !HelperUpdater.Available) return;
        _checkingUpdate = true;
        _updatesItem.Enabled = false;
        _nextUpdateCheck = DateTime.UtcNow.AddHours(8);
        try
        {
            var update = await HelperUpdater.DownloadAsync(_updateLifetime.Token, version => _uiActions.Enqueue(() =>
            {
                SetStatus($"Скачиваю обновление {version}…");
                ShowNotification("Обновление помощника", "Загружаю новую версию. Выбранная таблица откроется автоматически после обновления.", ToolTipIcon.Info);
            }));
            if (_updateLifetime.IsCancellationRequested) return;
            _pendingUpdate = update;
            _manualUpdate = manual;
            _updatesItem.Text = update is null ? $"Проверить обновления · {HelperUpdater.CurrentVersion.ToString(3)}" : $"Готово обновление {update.Release.Version}";
            if (update is not null)
                ShowNotification("Обновление подготовлено", "Если таблицы ещё не открыты, помощник обновится и сам откроет выбранный файл. Во время работы обновление дождётся закрытия общих таблиц.", ToolTipIcon.Info);
            else if (manual) ShowNotification("Обновления проверены", "Установлена последняя доступная версия помощника.", ToolTipIcon.Info);
        }
        catch (OperationCanceledException) when (_updateLifetime.IsCancellationRequested) { }
        catch (Exception error)
        {
            AppLog.Error("Helper update check failed; workbook sessions continue", error);
            _nextUpdateCheck = DateTime.UtcNow.AddMinutes(30);
            if (manual) ShowNotification("Обновление отложено", "Не удалось проверить или скачать обновление. Текущая версия продолжает работать; помощник попробует позже.", ToolTipIcon.Warning);
        }
        finally { _checkingUpdate = false; if (!_updateLifetime.IsCancellationRequested) _updatesItem.Enabled = true; }
    }

    private void ApplyPendingUpdate()
    {
        if (_pendingUpdate is null) return;
        var requests = new List<string>();
        try
        {
            // Finish every accepted pipe message before handing requests to the
            // next process. New launches wait for its pipe rather than losing a click.
            _singleInstance.StopServer();
            while (_incoming.TryDequeue(out var request)) if (request != ActivateMessage) requests.Add(request);
            HelperUpdater.StartApply(_pendingUpdate, true, requests);
            ExitThread();
        }
        catch (Exception error)
        {
            AppLog.Error("Helper update could not start; sessions retained", error);
            foreach (var request in requests) _incoming.Enqueue(request);
            _singleInstance.StartServer(message => _incoming.Enqueue(message));
            _nextUpdateApply = DateTime.UtcNow.AddMinutes(30);
        }
    }

    private async Task HandleProtocolRequestAsync(string rawRequest)
    {
        string? temporaryDownload = null;
        string? temporarySourceTextDownload = null;
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
            if (grant.Live is not null)
            {
                var existing = _sessionOrder.FirstOrDefault(session => session.IsLive && session.Grant.WorkbookKey == grant.WorkbookKey &&
                    session.Grant.Origin == grant.Origin);
                if (existing is not null && !existing.IsLiveClosed)
                {
                    if (request.Engine is "excel" or "calc" && request.Engine != existing.LiveEngine)
                        ShowNotification("Сначала закройте открытую таблицу", "Сохраните её через Ctrl+S, дождитесь сохранения на доске и закройте файл. Затем нажмите «Решать» с выбранной программой.", ToolTipIcon.Info);
                    await existing.ActivateLiveOfficeAsync(); return;
                }
                if (existing is not null) RemoveSession(existing, true);
            }
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

            string? sourceTextPath = null;
            if (!string.IsNullOrWhiteSpace(grant.SourceTextFileName))
            {
                var safeSourceTextFileName = LocalSourceTextFiles.SanitizeFileName(grant.SourceTextFileName);
                sourceTextPath = LocalSourceTextFiles.GetUniquePath(
                    AppPaths.AssignmentsDirectory,
                    safeSourceTextFileName);
                temporarySourceTextDownload = Path.Combine(
                    Path.GetDirectoryName(sourceTextPath)!,
                    $".{Path.GetFileName(sourceTextPath)}.{Guid.NewGuid():N}.download");

                SetStatus("Скачиваю текст задания…");
                await api.DownloadSourceTextAsync(grant, temporarySourceTextDownload, CancellationToken.None);
                File.Move(temporarySourceTextDownload, sourceTextPath);
                temporarySourceTextDownload = null;
            }

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
                requiresManualMacroOpen,
                request.Engine);
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

            var workbookOpened = false;
            try
            {
                if (currentGrant.Live is null) LiveOfficePreference.OpenSeparateWorkbook(finalPath);
                workbookOpened = true;
            }
            catch (Exception openError)
            {
                AppLog.Error("Could not open workbook with the system association", openError);
            }

            var sourceTextOpened = false;
            if (!string.IsNullOrWhiteSpace(sourceTextPath))
            {
                try
                {
                    OpenTextInNotepad(sourceTextPath);
                    sourceTextOpened = true;
                }
                catch (Exception openError)
                {
                    AppLog.Error("Could not open source text in Notepad", openError);
                }
            }

            if (workbookOpened && sourceTextOpened)
            {
                ShowNotification(
                    "Задание готово",
                    "Текст открыт в Блокноте, пустая таблица — в Excel или LibreOffice. Автосохранение следит только за таблицей.",
                    ToolTipIcon.Info);
            }
            else if (workbookOpened)
            {
                ShowNotification(
                    "Таблица готова",
                    string.IsNullOrWhiteSpace(sourceTextPath)
                        ? "Файл открыт. Сохраняйте его в Excel или LibreOffice — изменения уйдут в конспекты сами."
                        : $"Таблица открыта, но Блокнот запустить не удалось. Текст сохранён здесь: {sourceTextPath}",
                    string.IsNullOrWhiteSpace(sourceTextPath) ? ToolTipIcon.Info : ToolTipIcon.Warning);
            }
            else
            {
                ShowNotification(
                    "Файлы скачаны",
                    sourceTextOpened
                        ? $"Текст открыт в Блокноте. Таблицу откройте вручную: {finalPath}"
                        : $"Не удалось открыть файлы автоматически. Таблица лежит здесь: {finalPath}",
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
            TryDelete(temporarySourceTextDownload);
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

    private void OnSaveAsCandidate(object? sender, WorkbookPathCandidateEventArgs args)
    {
        string candidatePath;
        try
        {
            candidatePath = Path.GetFullPath(args.Path);
        }
        catch
        {
            return;
        }
        if (!_handledSaveAsCandidates.TryAdd(candidatePath, 0)) return;

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(650).ConfigureAwait(false);
                _uiActions.Enqueue(() => HandleSaveAsCandidate(candidatePath));
            }
            catch (Exception error)
            {
                AppLog.Error("Could not queue Save As candidate", error);
            }
        });
    }

    private void HandleSaveAsCandidate(string candidatePath)
    {
        if (!File.Exists(candidatePath)
            || _sessions.Values.Any(session => PathsEqual(session.LocalPath, candidatePath)))
        {
            return;
        }

        var matchingSessions = _sessionOrder
            .Where(session => LocalWorkbookFiles.IsPossibleSaveAsPath(session.LocalPath, candidatePath))
            .ToList();
        if (matchingSessions.Count == 0) return;

        WorkbookSession? selectedSession;
        if (matchingSessions.Count == 1)
        {
            selectedSession = matchingSessions[0];
        }
        else
        {
            using var dialog = new SaveAsSessionDialog(candidatePath, matchingSessions);
            selectedSession = dialog.ShowDialog() == DialogResult.OK
                ? dialog.SelectedSession
                : null;
        }
        if (selectedSession is null) return;

        var previousPath = selectedSession.LocalPath;
        if (!selectedSession.TryAdoptLocalPath(candidatePath)) return;
        RekeySession(selectedSession, previousPath);
        _sessionOrder.Remove(selectedSession);
        _sessionOrder.Add(selectedSession);
        _latestSession = selectedSession;
        UpdateSessionMenu();
        SetStatus($"Слежу за новой копией · {selectedSession.FileName}");
        ShowNotification(
            "Новая копия подключена",
            $"Файл «{selectedSession.FileName}» теперь автоматически сохраняется в конспекты.",
            ToolTipIcon.Info);
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

    private async void OpenCurrentFile()
    {
        if (_latestSession?.IsLive == true)
        {
            try { await _latestSession.ActivateLiveOfficeAsync(); }
            catch (Exception error) { ShowNotification("Не удалось открыть таблицу", error.Message, ToolTipIcon.Warning); }
            return;
        }
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
            LiveOfficePreference.OpenSeparateWorkbook(_latestSession.LocalPath);
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

    private static void ShowUsageInstructions()
    {
        MessageBox.Show(
            "Помощник запущен и ждёт задания в области уведомлений рядом с часами.\n\n"
            + "1. Откройте https://ivan100.ru и войдите в учётную запись.\n"
            + "2. Выберите учебную таблицу.\n"
            + "3. Нажмите «Excel / LibreOffice».\n"
            + "4. Сохраняйте файл как обычно — помощник отправит изменения обратно в конспекты.\n\n"
            + "Для работы нужен Microsoft Excel или LibreOffice.",
            "Иван на сотку — помощник таблиц",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    private static void OpenPlatform()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "https://ivan100.ru",
                UseShellExecute = true
            });
        }
        catch (Exception error)
        {
            AppLog.Error("Could not open platform website", error);
            MessageBox.Show(
                "Не удалось открыть сайт автоматически. Откройте https://ivan100.ru в браузере.",
                "Иван на сотку",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    private void UpdateSessionMenu()
    {
        var active = _latestSession is not null;
        _openItem.Enabled = active;
        _pauseItem.Enabled = active;
        _retryItem.Enabled = active;
        _controlsItem.Enabled = active && _latestSession?.IsLive == true;
        _participantsItem.Visible = active && _latestSession?.IsLive == true;
        _stopItem.Enabled = active;
        _pauseItem.Text = _latestSession?.IsPaused == true
            ? "Продолжить автосохранение"
            : "Приостановить автосохранение";
    }

    private void UpdateParticipantsMenu()
    {
        foreach (var item in _participantsItem.DropDownItems.Cast<ToolStripItem>().ToArray()) item.Dispose();
        _participantsItem.DropDownItems.Clear();
        var peers = _latestSession?.LiveParticipants;
        if (peers is null || peers.Count == 0)
        {
            _participantsItem.DropDownItems.Add(new ToolStripLabel("Другие участники не подключены"));
            return;
        }
        foreach (var peer in peers.Take(32))
            _participantsItem.DropDownItems.Add(new ToolStripLabel("● " + peer!["name"]!.GetValue<string>())
                { ForeColor = ColorTranslator.FromHtml(peer["color"]!.GetValue<string>()) });
    }

    private void RegisterSession(WorkbookGrant grant, WorkbookSession session)
    {
        var key = BuildSessionKey(grant, session.LocalPath);
        if (_sessions.Remove(key, out var previous))
        {
            _sessionOrder.Remove(previous);
            previous.StatusChanged -= OnSessionStatusChanged;
            previous.SaveAsCandidate -= OnSaveAsCandidate;
            previous.Dispose();
        }
        _sessions[key] = session;
        _sessionOrder.Add(session);
        _latestSession = session;
        session.SaveAsCandidate += OnSaveAsCandidate;
    }

    private void RekeySession(WorkbookSession session, string previousPath)
    {
        _sessions.Remove(BuildSessionKey(session.Grant, previousPath));
        _sessions[BuildSessionKey(session.Grant, session.LocalPath)] = session;
    }

    private void RemoveSession(WorkbookSession session, bool dispose)
    {
        var entry = _sessions.FirstOrDefault(pair => ReferenceEquals(pair.Value, session));
        if (!string.IsNullOrWhiteSpace(entry.Key)) _sessions.Remove(entry.Key);
        _sessionOrder.Remove(session);
        session.StatusChanged -= OnSessionStatusChanged;
        session.SaveAsCandidate -= OnSaveAsCandidate;
        if (dispose) session.Dispose();
        _latestSession = _sessionOrder.LastOrDefault();
    }

    private bool ContainsSession(WorkbookSession session) =>
        _sessions.Values.Any(candidate => ReferenceEquals(candidate, session));

    internal static string BuildSessionKey(WorkbookGrant grant, string localPath) =>
        $"{grant.Origin.GetLeftPart(UriPartial.Authority).TrimEnd('/').ToLowerInvariant()}\n{grant.WorkbookKey}\n{Path.GetFullPath(localPath)}";

    private static bool PathsEqual(string left, string right)
    {
        try
        {
            return string.Equals(Path.GetFullPath(left), Path.GetFullPath(right), StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

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

    private static void OpenTextInNotepad(string path)
    {
        var systemDirectory = Environment.GetFolderPath(Environment.SpecialFolder.System);
        var notepadPath = Path.Combine(systemDirectory, "notepad.exe");
        if (string.IsNullOrWhiteSpace(systemDirectory)
            || !Path.IsPathFullyQualified(notepadPath)
            || !File.Exists(notepadPath))
        {
            throw new FileNotFoundException("Не удалось найти системный Блокнот Windows.", notepadPath);
        }
        var startInfo = new ProcessStartInfo
        {
            FileName = notepadPath,
            UseShellExecute = false,
            WorkingDirectory = Path.GetDirectoryName(path) ?? Environment.CurrentDirectory
        };
        startInfo.ArgumentList.Add(path);
        Process.Start(startInfo);
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
        _updateLifetime.Cancel();
        _queueTimer.Stop();
        foreach (var session in _sessionOrder.ToArray()) RemoveSession(session, dispose: true);
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        _singleInstance.Dispose();
        base.ExitThreadCore();
    }

    public static string ActivationMessage => ActivateMessage;
}

using System.Threading.Channels;

namespace IvanEge.WorkbookHelper;

internal sealed class WorkbookSession : IDisposable
{
    private static readonly TimeSpan DebounceDelay = TimeSpan.FromMilliseconds(1500);
    private static readonly TimeSpan[] RetryDelays =
    [
        TimeSpan.FromSeconds(2),
        TimeSpan.FromSeconds(5),
        TimeSpan.FromSeconds(15),
        TimeSpan.FromSeconds(30),
        TimeSpan.FromSeconds(60),
        TimeSpan.FromSeconds(60)
    ];

    private readonly HelperApiClient _api;
    private readonly WorkbookGrant _grant;
    private readonly string _localPath;
    private readonly Func<string?, CancellationToken, Task<string?>> _requestSolutionName;
    private readonly CancellationTokenSource _lifetime = new();
    private readonly Channel<byte> _signals = Channel.CreateBounded<byte>(new BoundedChannelOptions(1)
    {
        SingleReader = true,
        SingleWriter = false,
        FullMode = BoundedChannelFullMode.DropOldest
    });
    private readonly object _watcherGate = new();
    private FileSystemWatcher? _watcher;
    private readonly Task _worker;
    private volatile bool _paused;
    private bool _disposed;
    private string _lastUploadedHash;
    private string _revision;
    private bool _requiresName;
    private string? _pendingSolutionName;

    public WorkbookSession(
        HelperApiClient api,
        WorkbookGrant grant,
        string localPath,
        string initialContentHash,
        Func<string?, CancellationToken, Task<string?>> requestSolutionName,
        bool requiresManualMacroOpen = false)
    {
        _api = api;
        _grant = grant;
        _localPath = localPath;
        _requestSolutionName = requestSolutionName;
        _lastUploadedHash = initialContentHash;
        _revision = grant.Revision;
        _requiresName = grant.RequiresName;
        RequiresManualMacroOpen = requiresManualMacroOpen;
        CreateWatcher();
        _worker = Task.Run(ProcessSignalsAsync);
    }

    public event EventHandler<WorkbookStatus>? StatusChanged;

    public string LocalPath => _localPath;
    public string FileName => Path.GetFileName(_localPath);
    public bool IsPaused => _paused;
    public bool RequiresManualMacroOpen { get; }

    public void SetPaused(bool paused)
    {
        _paused = paused;
        Publish(paused
            ? new WorkbookStatus(WorkbookStatusKind.Paused, "Автосохранение приостановлено")
            : new WorkbookStatus(WorkbookStatusKind.Watching, "Слежу за сохранениями таблицы"));
        if (!paused) Signal();
    }

    public void RetryNow() => Signal();

    private void CreateWatcher()
    {
        lock (_watcherGate)
        {
            _watcher?.Dispose();
            var directory = Path.GetDirectoryName(_localPath)
                ?? throw new InvalidOperationException("У рабочей таблицы нет каталога.");
            var watcher = new FileSystemWatcher(directory)
            {
                Filter = "*.*",
                IncludeSubdirectories = false,
                NotifyFilter = NotifyFilters.FileName
                    | NotifyFilters.LastWrite
                    | NotifyFilters.Size
                    | NotifyFilters.CreationTime,
                InternalBufferSize = 64 * 1024,
                EnableRaisingEvents = false
            };
            watcher.Changed += OnChanged;
            watcher.Created += OnChanged;
            watcher.Deleted += OnChanged;
            watcher.Renamed += OnRenamed;
            watcher.Error += OnWatcherError;
            watcher.EnableRaisingEvents = true;
            _watcher = watcher;
        }
    }

    private void OnChanged(object sender, FileSystemEventArgs args)
    {
        if (PathsEqual(args.FullPath, _localPath)) Signal();
    }

    private void OnRenamed(object sender, RenamedEventArgs args)
    {
        if (PathsEqual(args.FullPath, _localPath) || PathsEqual(args.OldFullPath, _localPath)) Signal();
    }

    private void OnWatcherError(object sender, ErrorEventArgs args)
    {
        if (_disposed) return;
        Publish(new WorkbookStatus(WorkbookStatusKind.Warning, "Перезапускаю слежение за файлом…"));
        try
        {
            CreateWatcher();
            Signal();
        }
        catch (Exception error)
        {
            AppLog.Error("Could not recreate FileSystemWatcher", error);
            Publish(new WorkbookStatus(WorkbookStatusKind.Error, "Не удалось продолжить слежение за таблицей", true));
        }
    }

    private void Signal()
    {
        if (!_disposed) _signals.Writer.TryWrite(1);
    }

    private async Task ProcessSignalsAsync()
    {
        try
        {
            while (await _signals.Reader.WaitToReadAsync(_lifetime.Token).ConfigureAwait(false))
            {
                while (_signals.Reader.TryRead(out _)) { }
                var receivedAnotherSignal = true;
                while (receivedAnotherSignal)
                {
                    await Task.Delay(DebounceDelay, _lifetime.Token).ConfigureAwait(false);
                    receivedAnotherSignal = false;
                    while (_signals.Reader.TryRead(out _)) receivedAnotherSignal = true;
                }

                if (_paused) continue;
                await SynchronizeLatestAsync(_lifetime.Token).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested)
        {
            // Expected during shutdown.
        }
        catch (Exception error)
        {
            AppLog.Error("Workbook worker stopped unexpectedly", error);
            Publish(new WorkbookStatus(WorkbookStatusKind.Error, "Автосохранение остановилось. Запустите таблицу заново.", true));
        }
    }

    private async Task SynchronizeLatestAsync(CancellationToken cancellationToken)
    {
        if (_grant.ExpiresAt is { } expiresAt && expiresAt <= DateTimeOffset.UtcNow)
        {
            Publish(new WorkbookStatus(
                WorkbookStatusKind.Error,
                "Срок доступа истёк. Нажмите «Решать» на платформе ещё раз.",
                true));
            return;
        }

        try
        {
            Publish(new WorkbookStatus(WorkbookStatusKind.Reading, "Проверяю сохранённую таблицу…"));
            using var snapshot = await StableFileSnapshot.CaptureAsync(
                _localPath,
                TimeSpan.FromSeconds(30),
                cancellationToken).ConfigureAwait(false);
            if (string.Equals(snapshot.ContentHash, _lastUploadedHash, StringComparison.OrdinalIgnoreCase))
            {
                Publish(new WorkbookStatus(WorkbookStatusKind.Watching, "Слежу за сохранениями таблицы"));
                return;
            }

            var solutionName = await ResolveSolutionNameAsync(cancellationToken).ConfigureAwait(false);
            if (_requiresName && string.IsNullOrWhiteSpace(solutionName))
            {
                Publish(new WorkbookStatus(
                    WorkbookStatusKind.Watching,
                    "Название не выбрано · спрошу снова после следующего сохранения"));
                return;
            }

            var receipt = await UploadWithRetryAsync(snapshot, solutionName, cancellationToken).ConfigureAwait(false);
            _lastUploadedHash = snapshot.ContentHash;
            _revision = string.IsNullOrWhiteSpace(receipt.Revision) ? _revision : receipt.Revision;
            if (_requiresName)
            {
                _requiresName = false;
                _pendingSolutionName = null;
            }
            Publish(new WorkbookStatus(WorkbookStatusKind.Saved, $"Сохранено в конспекты · {DateTime.Now:HH:mm}"));
        }
        catch (HelperApiException error)
        {
            AppLog.Error("Workbook synchronization failed", error);
            var statusCode = error.StatusCode is { } responseStatus ? (int)responseStatus : 0;
            if (_requiresName && !error.IsTransient && statusCode is 400 or 409 or 422)
            {
                _pendingSolutionName = null;
            }
            if (error.IsTransient)
            {
                Publish(new WorkbookStatus(
                    WorkbookStatusKind.Warning,
                    $"{error.Message} Попробую снова через минуту.",
                    true));
                _ = ScheduleRetryAsync(TimeSpan.FromMinutes(1));
            }
            else
            {
                Publish(new WorkbookStatus(WorkbookStatusKind.Error, error.Message, true));
            }
        }
        catch (IOException error)
        {
            AppLog.Error("Workbook file could not be read", error);
            Publish(new WorkbookStatus(WorkbookStatusKind.Warning, "Не удалось прочитать файл. Попробую после следующего сохранения."));
        }
    }

    private async Task<string?> ResolveSolutionNameAsync(CancellationToken cancellationToken)
    {
        if (!_requiresName) return null;
        if (!string.IsNullOrWhiteSpace(_pendingSolutionName)) return _pendingSolutionName;

        Publish(new WorkbookStatus(WorkbookStatusKind.Reading, "Жду название решённой работы…"));
        string? selectedName;
        try
        {
            selectedName = await _requestSolutionName(_grant.SolutionName, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error)
        {
            AppLog.Error("Could not request a solution name", error);
            Publish(new WorkbookStatus(
                WorkbookStatusKind.Warning,
                "Не удалось открыть выбор названия · попробую после следующего сохранения",
                true));
            return null;
        }

        if (string.IsNullOrWhiteSpace(selectedName)) return null;
        if (!SolutionNameRules.TryNormalize(selectedName, out var normalized, out var validationError))
        {
            AppLog.Error("Solution name callback returned an invalid value", new FormatException(validationError));
            Publish(new WorkbookStatus(
                WorkbookStatusKind.Warning,
                "Название не подходит · спрошу снова после следующего сохранения",
                true));
            return null;
        }

        _pendingSolutionName = normalized;
        return _pendingSolutionName;
    }

    private async Task<UploadReceipt> UploadWithRetryAsync(
        StableFileSnapshot snapshot,
        string? solutionName,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                Publish(new WorkbookStatus(
                    WorkbookStatusKind.Uploading,
                    attempt == 0 ? "Отправляю в конспекты…" : $"Повторяю отправку · попытка {attempt + 1}"));
                return await _api.UploadAsync(
                    _grant,
                    snapshot.Path,
                    snapshot.ContentHash,
                    _revision,
                    solutionName,
                    cancellationToken).ConfigureAwait(false);
            }
            catch (HelperApiException error) when (error.IsTransient && attempt < RetryDelays.Length)
            {
                var retryAfter = error.RetryAfter.GetValueOrDefault();
                var hasServerRetryAfter = error.RetryAfter.HasValue && retryAfter > TimeSpan.Zero;
                var baseDelay = hasServerRetryAfter ? retryAfter : RetryDelays[attempt];
                if (baseDelay > TimeSpan.FromMinutes(2)) baseDelay = TimeSpan.FromMinutes(2);
                var jitter = hasServerRetryAfter
                    ? 1.0 + Random.Shared.NextDouble() * 0.2
                    : 0.8 + Random.Shared.NextDouble() * 0.4;
                var delay = TimeSpan.FromMilliseconds(Math.Max(500, baseDelay.TotalMilliseconds * jitter));
                Publish(new WorkbookStatus(WorkbookStatusKind.Warning, $"Нет связи. Повторю через {Math.Ceiling(delay.TotalSeconds):0} сек."));
                await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    private void Publish(WorkbookStatus status)
    {
        try
        {
            StatusChanged?.Invoke(this, status);
        }
        catch (Exception error)
        {
            AppLog.Error("Status subscriber failed", error);
        }
    }

    private async Task ScheduleRetryAsync(TimeSpan delay)
    {
        try
        {
            await Task.Delay(delay, _lifetime.Token).ConfigureAwait(false);
            Signal();
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested)
        {
            // The session was stopped before the delayed retry.
        }
    }

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

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        lock (_watcherGate)
        {
            _watcher?.Dispose();
            _watcher = null;
        }
        _signals.Writer.TryComplete();
        _lifetime.Cancel();
        _lifetime.Dispose();
        _api.Dispose();
    }
}

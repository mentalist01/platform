using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;

namespace IvanEge.WorkbookHelper;

internal sealed class SingleInstance : IDisposable
{
    private readonly Mutex _mutex;
    private readonly string _pipeName;
    private readonly CancellationTokenSource _lifetime = new();
    private Task? _serverTask;
    private bool _disposed;

    private SingleInstance(Mutex mutex, bool isPrimary, string pipeName)
    {
        _mutex = mutex;
        IsPrimary = isPrimary;
        _pipeName = pipeName;
    }

    public bool IsPrimary { get; }

    public static SingleInstance Create()
    {
        var identity = $"{Environment.UserDomainName}\\{Environment.UserName}";
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)))[..20];
        var mutexName = $@"Local\IvanEge.WorkbookHelper.{hash}";
        var pipeName = $"IvanEge.WorkbookHelper.{hash}";
        var mutex = new Mutex(true, mutexName, out var createdNew);
        return new SingleInstance(mutex, createdNew, pipeName);
    }

    public void StartServer(Action<string> receive)
    {
        if (!IsPrimary || _serverTask is not null) return;
        _serverTask = Task.Run(async () =>
        {
            while (!_lifetime.IsCancellationRequested)
            {
                try
                {
                    await using var pipe = new NamedPipeServerStream(
                        _pipeName,
                        PipeDirection.In,
                        1,
                        PipeTransmissionMode.Byte,
                        PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                    await pipe.WaitForConnectionAsync(_lifetime.Token).ConfigureAwait(false);
                    using var reader = new StreamReader(pipe, Encoding.UTF8, false, 1024, leaveOpen: true);
                    var message = await reader.ReadLineAsync().WaitAsync(_lifetime.Token).ConfigureAwait(false);
                    if (!string.IsNullOrWhiteSpace(message) && message.Length <= 4096)
                    {
                        receive(message);
                    }
                }
                catch (OperationCanceledException) when (_lifetime.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception error)
                {
                    AppLog.Error("Named pipe server failed", error);
                    try
                    {
                        await Task.Delay(300, _lifetime.Token).ConfigureAwait(false);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                }
            }
        });
    }

    public async Task<bool> ForwardAsync(string message, CancellationToken cancellationToken = default)
    {
        if (IsPrimary) return false;
        try
        {
            await using var pipe = new NamedPipeClientStream(
                ".",
                _pipeName,
                PipeDirection.Out,
                PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(3));
            await pipe.ConnectAsync(timeout.Token).ConfigureAwait(false);
            await using var writer = new StreamWriter(pipe, new UTF8Encoding(false), 1024, leaveOpen: true)
            {
                AutoFlush = true
            };
            await writer.WriteLineAsync(message.AsMemory(), timeout.Token).ConfigureAwait(false);
            return true;
        }
        catch (Exception error)
        {
            AppLog.Error("Could not forward request to the running helper", error);
            return false;
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _lifetime.Cancel();
        if (IsPrimary)
        {
            try
            {
                _mutex.ReleaseMutex();
            }
            catch
            {
                // Already released during shutdown.
            }
        }
        _mutex.Dispose();
        _lifetime.Dispose();
    }
}

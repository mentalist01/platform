using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;

namespace IvanEge.WorkbookHelper;

internal sealed class LiveOfficeProcess : IDisposable
{
    private readonly Process _process;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private int _sequence;
    private bool _disconnected;
    private readonly string _directory;
    private readonly Task<string> _diagnostics;
    public string LocalPath { get; private set; }
    public bool Closed { get; private set; }
    public LiveWorkbookBook Reader { get; } = new();
    private LiveOfficeProcess(Process process, string directory, string localPath)
    {
        _process = process; _directory = directory; LocalPath = localPath;
        _diagnostics = process.StandardError.ReadToEndAsync();
    }

    public static async Task<LiveOfficeProcess> OpenAsync(string source, string directory, string engine, bool hidden, CancellationToken token)
    {
        Directory.CreateDirectory(directory);
        string local = Path.Combine(directory, "Общая таблица.xlsx");
        if (File.Exists(local)) local = Path.Combine(directory, "Общая таблица " + Guid.NewGuid().ToString("N")[..8] + ".xlsx");
        var start = new ProcessStartInfo { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardInputEncoding = new UTF8Encoding(false), StandardOutputEncoding = Encoding.UTF8 };
        if (engine == "excel")
        {
            start.FileName = Environment.ProcessPath!;
            start.ArgumentList.Add("--live-excel-bridge");
        }
        else
        {
            var program = FindCalc();
            start.FileName = Path.Combine(program, "python.exe"); start.WorkingDirectory = program;
            string script = Path.Combine(directory, "LiveCalcBridge.py");
            using var resource = typeof(LiveOfficeProcess).Assembly.GetManifestResourceStream("IvanEge.WorkbookHelper.LiveCalcBridge.py") ?? throw new InvalidOperationException("Не найден встроенный мост LibreOffice");
            await using (var output = File.Create(script)) await resource.CopyToAsync(output, token);
            start.ArgumentList.Add(script); start.ArgumentList.Add("--soffice"); start.ArgumentList.Add(Path.Combine(program, "soffice.exe"));
            start.ArgumentList.Add("--profile"); start.ArgumentList.Add(Path.Combine(Path.GetTempPath(), "iv100-live-" + Guid.NewGuid().ToString("N")[..12]));
        }
        start.ArgumentList.Add("--file"); start.ArgumentList.Add(Path.GetFullPath(source));
        start.ArgumentList.Add("--local"); start.ArgumentList.Add(local); if (hidden) start.ArgumentList.Add("--hidden");
        var process = Process.Start(start) ?? throw new InvalidOperationException("Не удалось запустить таблицу");
        var bridge = new LiveOfficeProcess(process, directory, local);
        try
        {
            var line = await process.StandardOutput.ReadLineAsync(token).AsTask().WaitAsync(TimeSpan.FromSeconds(50), token);
            var result = JsonNode.Parse(line ?? "{}")!;
            if (result["ready"]?.GetValue<bool>() != true) throw new InvalidOperationException(result["startupError"]?.GetValue<string>() ?? "Офисное приложение не ответило");
            return bridge;
        }
        catch (Exception error)
        {
            bridge.Closed = true;
            await Task.WhenAny(bridge._diagnostics, Task.Delay(1500, CancellationToken.None));
            if (bridge._diagnostics.IsCompletedSuccessfully && !string.IsNullOrWhiteSpace(bridge._diagnostics.Result))
                AppLog.Info("Office bridge startup diagnostics: " + bridge._diagnostics.Result);
            bridge.Dispose();
            if (error is OperationCanceledException) throw;
            string reason = error.Message.Contains("URP bridge", StringComparison.OrdinalIgnoreCase)
                ? "LibreOffice прервал соединение во время открытия."
                : error.Message;
            throw new InvalidOperationException("Не удалось открыть общую таблицу в " + (engine == "excel" ? "Excel" : "LibreOffice") + ": " + reason, error);
        }
    }
    public static string FindCalc()
    {
        var candidates = new[] { Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "LibreOffice", "program"), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "LibreOffice", "program") };
        return candidates.FirstOrDefault(directory => File.Exists(Path.Combine(directory, "python.exe")) && File.Exists(Path.Combine(directory, "soffice.exe")))
            ?? throw new InvalidOperationException("Не найден LibreOffice со встроенным Python. Выберите Excel или установите LibreOffice.");
    }
    public async Task<JsonObject> CommandAsync(JsonObject command, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            if (Closed || _process.HasExited) { Closed = _disconnected = true; throw new LiveOfficeDisconnectedException(); }
            command["id"] = ++_sequence;
            await _process.StandardInput.WriteLineAsync(command.ToJsonString().AsMemory(), token); await _process.StandardInput.FlushAsync(token);
            var line = await _process.StandardOutput.ReadLineAsync(token).AsTask().WaitAsync(TimeSpan.FromSeconds(60), token);
            if (line is null) { Closed = _disconnected = true; throw new LiveOfficeDisconnectedException(); }
            var response = JsonNode.Parse(line)!;
            if (response["disconnected"]?.GetValue<bool>() == true)
            {
                Closed = _disconnected = true;
                AppLog.Info("Office connection was lost: " + response["error"]?.GetValue<string>());
                throw new LiveOfficeDisconnectedException();
            }
            if (response["closed"]?.GetValue<bool>() == true) { Closed = true; throw new LiveOfficeClosedException(); }
            if (response["error"] is not null) throw new InvalidOperationException(response["error"]!.GetValue<string>());
            if (response["id"]?.GetValue<int>() != _sequence) throw new InvalidOperationException("Мост таблицы вернул неверный номер команды");
            return response["result"]!.AsObject();
        }
        catch (Exception error) when ((error is IOException or TimeoutException) && error is not LiveOfficeClosedException && error is not LiveOfficeDisconnectedException)
        {
            Closed = _disconnected = true;
            throw new LiveOfficeDisconnectedException(error);
        }
        finally { _gate.Release(); }
    }
    public async Task<(JsonObject Book, string File)> SnapshotAsync(CancellationToken token)
    {
        string file = Path.Combine(_directory, "snapshot-" + Guid.NewGuid().ToString("N") + ".xlsx");
        try
        {
            // A broken bridge is not proof that the user saved/closed the file.
            // Never publish an older local file as if it were a fresh snapshot.
            if (_disconnected) throw new LiveOfficeDisconnectedException();
            JsonObject result;
            try { result = Closed ? throw new LiveOfficeClosedException() : await CommandAsync(new() { ["type"] = "snapshot", ["path"] = file }, token); }
            catch (LiveOfficeClosedException) when (File.Exists(LocalPath))
            { File.Copy(LocalPath, file); return (Reader.Read(file), file); }
            if (result["localPath"]?.GetValue<string>() is string local && Path.IsPathFullyQualified(local)) LocalPath = local;
            return (Reader.Read(file), file);
        }
        catch { try { File.Delete(file); } catch { } throw; }
    }
    public void Dispose()
    {
        try
        {
            if (!_process.HasExited)
            {
                _process.StandardInput.WriteLine("{\"type\":\"close\"}"); _process.StandardInput.Close();
                // Let the bridge save its full local recovery copy and close
                // its own instance. Never terminate the user's office process.
            }
        }
        catch { }
    }
}

internal sealed class LiveOfficeDisconnectedException : IOException
{
    public LiveOfficeDisconnectedException(Exception? inner = null) : base(
        "Связь с таблицей прервалась. Если окно таблицы открыто, сохраните изменения через Ctrl+S и закройте его. Затем нажмите «Решать» на доске ещё раз. Локальные файлы сохранены.", inner) { }
}

internal sealed class LiveOfficeClosedException : IOException
{
    public LiveOfficeClosedException() : base("Таблица закрыта. Сохранённый файл остался на компьютере.") { }
}

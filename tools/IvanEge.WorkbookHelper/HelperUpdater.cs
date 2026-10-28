using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace IvanEge.WorkbookHelper;

internal sealed record HelperUpdateRelease(string Version, string Url, string Sha256, long Bytes);
internal sealed record StagedHelperUpdate(string Id, string Directory, HelperUpdateRelease Release);

// A separate release key authenticates updates even before Authenticode signing is
// available. It is not a Windows publisher certificate and grants no OS trust.
internal static partial class HelperUpdater
{
    internal const int MaxManifestBytes = 16 * 1024;
    internal const long MaxExecutableBytes = 250L * 1024 * 1024;
    internal const string ManifestUrl = "https://ivan100.ru/downloads/workbook-helper-update.json";
    internal const string Product = "ivan100-workbook-helper-windows-x64";
    private static string Root => Path.Combine(AppPaths.InstallDirectory, "updates");
    private static string Pointer => Path.Combine(Root, "pending.txt");
    internal static Version CurrentVersion => typeof(Program).Assembly.GetName().Version ?? new Version(0, 0, 0, 0);
    internal static bool Available => !PackageIdentity.IsPackaged && string.Equals(
        Path.GetFullPath(Environment.ProcessPath ?? ""), Path.GetFullPath(AppPaths.InstalledExecutablePath), StringComparison.OrdinalIgnoreCase);
    public static bool Enabled
    {
        get { try { return File.ReadAllText(Path.Combine(AppPaths.DataDirectory, "automatic-updates.txt")).Trim() != "off"; } catch { return true; } }
        set { AppPaths.EnsureDataDirectories(); File.WriteAllText(Path.Combine(AppPaths.DataDirectory, "automatic-updates.txt"), value ? "on" : "off"); }
    }

    internal static byte[] PublicKey()
    {
        using var stream = typeof(Program).Assembly.GetManifestResourceStream("IvanEge.WorkbookHelper.UpdatePublicKey")
            ?? throw new InvalidDataException("Отсутствует ключ проверки обновлений.");
        using var json = JsonDocument.Parse(stream);
        return Convert.FromBase64String(json.RootElement.GetProperty("publicKeySpkiBase64").GetString()!);
    }

    internal static HelperUpdateRelease VerifyManifest(byte[] envelope, byte[]? publicKey = null)
    {
        if (envelope.Length > MaxManifestBytes) throw new InvalidDataException("Слишком большой манифест обновления.");
        using var json = JsonDocument.Parse(envelope);
        var payload = Convert.FromBase64String(json.RootElement.GetProperty("payload").GetString()!);
        var signature = Convert.FromBase64String(json.RootElement.GetProperty("signature").GetString()!);
        using var key = ECDsa.Create();
        key.ImportSubjectPublicKeyInfo(publicKey ?? PublicKey(), out _);
        if (!key.VerifyData(payload, signature, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence))
            throw new CryptographicException("Подпись обновления не прошла проверку.");
        using var content = JsonDocument.Parse(payload);
        var item = content.RootElement;
        if (item.GetProperty("schema").GetInt32() != 1 || item.GetProperty("product").GetString() != Product)
            throw new InvalidDataException("Обновление предназначено для другой программы.");
        var release = new HelperUpdateRelease(item.GetProperty("version").GetString()!, item.GetProperty("url").GetString()!,
            item.GetProperty("sha256").GetString()!, item.GetProperty("bytes").GetInt64());
        ValidateRelease(release);
        return release;
    }

    internal static void ValidateRelease(HelperUpdateRelease release)
    {
        if (!VersionPattern().IsMatch(release.Version) || !Version.TryParse(release.Version, out var version) || version.ToString(4) != release.Version)
            throw new InvalidDataException("Некорректная версия обновления.");
        if (release.Url != $"https://ivan100.ru/downloads/updates/IvanEgeWorkbookHelper-{release.Version}.exe"
            || !HashPattern().IsMatch(release.Sha256) || release.Bytes < 256 || release.Bytes > MaxExecutableBytes)
            throw new InvalidDataException("Некорректный адрес или размер обновления.");
    }

    internal static void VerifyExecutable(string file, HelperUpdateRelease release)
    {
        ValidateRelease(release);
        using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (stream.Length != release.Bytes || !string.Equals(Convert.ToHexString(SHA256.HashData(stream)), release.Sha256, StringComparison.OrdinalIgnoreCase))
            throw new CryptographicException("Контрольная сумма обновления не совпала.");
        if (FileVersionInfo.GetVersionInfo(file).FileVersion != release.Version)
            throw new InvalidDataException("Версия программы не совпала с подписанным обновлением.");
    }

    private static string StageDirectory(string id)
    {
        if (!Guid.TryParseExact(id, "N", out _)) throw new InvalidDataException("Некорректный идентификатор обновления.");
        return Path.Combine(Root, id);
    }

    internal static StagedHelperUpdate? Pending()
    {
        try
        {
            if (!File.Exists(Pointer)) return null;
            var id = File.ReadAllText(Pointer).Trim();
            var directory = StageDirectory(id);
            var release = VerifyManifest(File.ReadAllBytes(Path.Combine(directory, "manifest.json")));
            if (Version.Parse(release.Version) <= CurrentVersion) return null;
            VerifyExecutable(Path.Combine(directory, "package.exe"), release);
            return new(id, directory, release);
        }
        catch (Exception error) { AppLog.Error("Pending update validation failed", error); return null; }
    }

    internal static async Task<StagedHelperUpdate?> DownloadAsync(CancellationToken token, Action<string>? downloading = null)
    {
        CleanupStalePackages();
        using var handler = new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false, Credentials = null };
        // An unopened platform ticket lasts three minutes. Leave enough time for
        // verified installation and replay even on a stalled update connection.
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(token);
        lifetime.CancelAfter(TimeSpan.FromSeconds(90));
        token = lifetime.Token;
        using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(90) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd($"IvanEgeWorkbookHelper/{CurrentVersion}");
        using var manifestDeadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        manifestDeadline.CancelAfter(TimeSpan.FromSeconds(5));
        using var response = await client.GetAsync(ManifestUrl, HttpCompletionOption.ResponseHeadersRead, manifestDeadline.Token).ConfigureAwait(false);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        response.EnsureSuccessStatusCode();
        using var memory = new MemoryStream();
        await CopyBoundedAsync(await response.Content.ReadAsStreamAsync(manifestDeadline.Token), memory, MaxManifestBytes, manifestDeadline.Token).ConfigureAwait(false);
        var envelope = memory.ToArray();
        var release = VerifyManifest(envelope);
        if (Version.Parse(release.Version) <= CurrentVersion) return null;
        var previous = Pending();
        if (previous is not null && Version.Parse(previous.Release.Version) >= Version.Parse(release.Version)) return previous;
        downloading?.Invoke(release.Version);
        var id = Guid.NewGuid().ToString("N");
        var directory = StageDirectory(id);
        Directory.CreateDirectory(directory);
        var partial = Path.Combine(directory, "package.part");
        try
        {
            using var download = await client.GetAsync(release.Url, HttpCompletionOption.ResponseHeadersRead, token).ConfigureAwait(false);
            download.EnsureSuccessStatusCode();
            if (download.Content.Headers.ContentLength is long length && length != release.Bytes)
                throw new InvalidDataException("Размер загрузки не совпал с подписанным обновлением.");
            await using (var file = new FileStream(partial, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await CopyBoundedAsync(await download.Content.ReadAsStreamAsync(token), file, release.Bytes, token).ConfigureAwait(false);
                file.Flush(true);
            }
            VerifyExecutable(partial, release);
            File.Move(partial, Path.Combine(directory, "package.exe"));
            File.WriteAllBytes(Path.Combine(directory, "manifest.json"), envelope);
            File.WriteAllText(Pointer + ".new", id);
            File.Move(Pointer + ".new", Pointer, true);
            return new(id, directory, release);
        }
        catch { try { File.Delete(partial); } catch { } throw; }
    }

    private static void CleanupStalePackages()
    {
        try
        {
            if (!Directory.Exists(Root)) return;
            var pendingId = File.Exists(Pointer) ? File.ReadAllText(Pointer).Trim() : "";
            foreach (var directory in Directory.EnumerateDirectories(Root))
            {
                var info = new DirectoryInfo(directory);
                if (!Guid.TryParseExact(info.Name, "N", out _) || info.Name == pendingId
                    || info.Attributes.HasFlag(FileAttributes.ReparsePoint) || info.LastWriteTimeUtc > DateTime.UtcNow.AddDays(-7)) continue;
                if (!string.Equals(info.FullName, StageDirectory(info.Name), StringComparison.OrdinalIgnoreCase)) continue;
                // Delete only our known release artifacts, never recurse into an
                // unexpected directory or any assignment/recovery document.
                foreach (var name in new[] { "package.part", "package.exe", "manifest.json", "updater-host.exe" })
                    try { File.Delete(Path.Combine(info.FullName, name)); } catch { }
                if (!Directory.EnumerateFileSystemEntries(info.FullName).Any()) Directory.Delete(info.FullName);
            }
        }
        catch { /* Cleanup must never delay a workbook or block an update. */ }
    }

    internal static async Task CopyBoundedAsync(Stream input, Stream output, long limit, CancellationToken token)
    {
        using (input)
        {
            var buffer = new byte[65536]; long total = 0; int read;
            while ((read = await input.ReadAsync(buffer, token).ConfigureAwait(false)) > 0)
            {
                total += read;
                if (total > limit) throw new InvalidDataException("Загрузка превысила допустимый размер.");
                await output.WriteAsync(buffer.AsMemory(0, read), token).ConfigureAwait(false);
            }
        }
    }

    internal static void StartApply(StagedHelperUpdate update, bool restart, IEnumerable<string>? requests = null)
    {
        if (!Available) throw new InvalidOperationException("Автообновление доступно для установленного помощника.");
        VerifyExecutable(Path.Combine(update.Directory, "package.exe"), update.Release);
        var host = Path.Combine(update.Directory, "updater-host.exe");
        File.Copy(AppPaths.InstalledExecutablePath, host, true);
        var start = new ProcessStartInfo(host) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = update.Directory };
        foreach (var argument in new[] { "--apply-update", update.Id, Environment.ProcessId.ToString(), Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks.ToString(), restart ? "restart" : "exit" })
            start.ArgumentList.Add(argument);
        var queued = (requests ?? []).ToList();
        if (queued.Count > 8) throw new IOException("Открывается несколько таблиц. Обновление дождётся следующего запуска.");
        foreach (var request in queued) { ProtocolRequestParser.Parse(request); start.ArgumentList.Add("--uri"); start.ArgumentList.Add(request); }
        _ = Process.Start(start) ?? throw new IOException("Не удалось запустить установку обновления.");
    }

    internal static int Apply(string[] arguments)
    {
        try
        {
            if (arguments.Length < 5 || (arguments.Length - 5) % 2 != 0 || arguments.Length > 21
                || !int.TryParse(arguments[2], out var parentId) || !long.TryParse(arguments[3], out var parentStart)
                || arguments[4] is not ("restart" or "exit")) throw new InvalidDataException("Некорректная команда обновления.");
            var directory = StageDirectory(arguments[1]);
            if (!string.Equals(Path.GetFullPath(Environment.ProcessPath!), Path.Combine(directory, "updater-host.exe"), StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Некорректный путь установщика обновления.");
            var requests = new List<string>();
            for (var index = 5; index < arguments.Length; index += 2)
            {
                if (arguments[index] != "--uri" || arguments[index + 1].Length > 4096) throw new InvalidDataException("Некорректная команда открытия таблицы.");
                ProtocolRequestParser.Parse(arguments[index + 1]); requests.Add(arguments[index + 1]);
            }
            var release = VerifyManifest(File.ReadAllBytes(Path.Combine(directory, "manifest.json")));
            VerifyExecutable(Path.Combine(directory, "package.exe"), release);
            try
            {
                using var parent = Process.GetProcessById(parentId);
                if (parent.StartTime.ToUniversalTime().Ticks != parentStart || !parent.WaitForExit(60000))
                    throw new IOException("Помощник ещё занят. Обновление сохранено до следующего запуска.");
            }
            catch (ArgumentException) { /* Parent already exited. */ }
            var installed = AppPaths.InstalledExecutablePath;
            var previousVersion = Version.Parse(FileVersionInfo.GetVersionInfo(installed).FileVersion!);
            if (Version.Parse(release.Version) <= previousVersion)
            {
                if (arguments[4] == "restart") StartInstalled(requests);
                return 0;
            }
            using (var instance = SingleInstance.Create())
            {
                if (!instance.IsPrimary)
                {
                    foreach (var request in requests)
                        if (!instance.ForwardAsync(request).GetAwaiter().GetResult())
                            throw new IOException("Открытый помощник пока занят. Нажмите «Решать» ещё раз.");
                    return 2;
                }
                InstallVerified(directory, installed, release);
            }
            if (arguments[4] == "restart")
            {
                try
                {
                    StartInstalled(requests);
                }
                catch
                {
                    // Only restore the exact version we just installed, never a
                    // concurrently installed newer version or any workbook data.
                    using var instance = SingleInstance.Create();
                    if (instance.IsPrimary && File.Exists(installed + ".previous"))
                    {
                        VerifyExecutable(installed, release);
                        File.Replace(installed + ".previous", installed, null);
                    }
                    throw;
                }
            }
            if (File.Exists(Pointer) && File.ReadAllText(Pointer).Trim() == arguments[1]) File.Delete(Pointer);
            AppLog.Info("Helper update installed: " + release.Version);
            return 0;
        }
        catch (Exception error) { AppLog.Error("Helper update was not installed; prior version retained", error); return 1; }
    }

    private static void StartInstalled(IEnumerable<string> requests)
    {
        var start = new ProcessStartInfo(AppPaths.InstalledExecutablePath) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = AppPaths.InstallDirectory };
        start.ArgumentList.Add("--updated");
        foreach (var request in requests) { start.ArgumentList.Add("--uri"); start.ArgumentList.Add(request); }
        _ = Process.Start(start) ?? throw new IOException("Не удалось запустить новую версию помощника.");
    }

    internal static void InstallVerified(string directory, string installed, HelperUpdateRelease release, bool runSelfTest = true)
    {
        VerifyExecutable(Path.Combine(directory, "package.exe"), release);
        var next = installed + ".update-new.exe";
        File.Copy(Path.Combine(directory, "package.exe"), next, true);
        Installer.MakeWritable(next);
        VerifyExecutable(next, release);
        // Preserve the Internet zone marker; update authentication never disables
        // Windows/Defender checks or changes trusted publishers/root stores.
        if (!MarkOfTheWeb.TryApplyAndVerify(next, new Uri(release.Url)))
            throw new IOException("Windows не дал проверить защитную метку обновления.");
        if (runSelfTest)
        {
            using var check = Process.Start(new ProcessStartInfo(next, "--self-test") { UseShellExecute = false, CreateNoWindow = true })
                ?? throw new IOException("Не удалось проверить новую версию помощника.");
            if (!check.WaitForExit(60000) || check.ExitCode != 0)
                throw new IOException("Новая версия не прошла проверку. Сохранена прежняя версия помощника.");
        }
        var backup = installed + ".previous";
        var deadline = DateTime.UtcNow.AddSeconds(30);
        var previousAttributes = Installer.MakeWritable(installed);
        var replaced = false;
        try
        {
            while (true)
            {
                try { File.Replace(next, installed, backup, true); replaced = true; return; }
                catch (IOException) when (DateTime.UtcNow < deadline) { Thread.Sleep(300); }
            }
        }
        finally { if (!replaced && File.Exists(installed)) File.SetAttributes(installed, previousAttributes); }
    }

    internal static int VerifyPublished(string manifest, string executable)
    {
        try { var release = VerifyManifest(File.ReadAllBytes(manifest)); VerifyExecutable(executable, release); return 0; }
        catch (Exception error) { AppLog.Error("Published update verification failed", error); return 1; }
    }

    [GeneratedRegex(@"^\d{1,4}\.\d{1,4}\.\d{1,4}\.\d{1,4}$")]
    private static partial Regex VersionPattern();
    [GeneratedRegex(@"^[a-f0-9]{64}$")]
    private static partial Regex HashPattern();
}

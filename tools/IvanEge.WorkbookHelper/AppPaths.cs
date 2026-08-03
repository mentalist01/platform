using System.Text;

namespace IvanEge.WorkbookHelper;

internal static class AppPaths
{
    public const long MaxWorkbookBytes = 64L * 1024L * 1024L;

    public static string InstallDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "IvanEge",
        "WorkbookHelper");

    public static string InstalledExecutablePath => Path.Combine(InstallDirectory, "IvanEgeWorkbookHelper.exe");
    public static string DataDirectory => Path.Combine(InstallDirectory, "data");
    public static string TempDirectory => Path.Combine(InstallDirectory, "temp");
    public static string TrustedOriginsPath => Path.Combine(DataDirectory, "trusted-origins.json");
    public static string LogPath => Path.Combine(DataDirectory, "helper.log");

    public static string SolutionsDirectory
    {
        get
        {
            var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            if (!string.IsNullOrWhiteSpace(desktop))
            {
                var desktopTarget = Path.Combine(desktop, "Иван на сотку", "Решения");
                if (TryEnsureWritableDirectory(desktopTarget)) return desktopTarget;
            }

            var documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            if (string.IsNullOrWhiteSpace(documents))
            {
                documents = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Documents");
            }
            var documentsTarget = Path.Combine(documents, "Иван на сотку", "Решения");
            Directory.CreateDirectory(documentsTarget);
            return documentsTarget;
        }
    }

    public static void EnsureDataDirectories()
    {
        Directory.CreateDirectory(InstallDirectory);
        Directory.CreateDirectory(DataDirectory);
        Directory.CreateDirectory(TempDirectory);
    }

    public static void CleanupStaleTemporaryFiles()
    {
        try
        {
            EnsureDataDirectories();
            var cutoff = DateTime.UtcNow.AddDays(-2);
            foreach (var file in Directory.EnumerateFiles(TempDirectory, "*.tmp"))
            {
                try
                {
                    if (File.GetLastWriteTimeUtc(file) < cutoff) File.Delete(file);
                }
                catch
                {
                    // A currently running snapshot is allowed to stay.
                }
            }
        }
        catch
        {
            // Cleanup is best effort and must not prevent startup.
        }
    }

    public static int CleanupStaleSolutionDownloads(string? directory = null, DateTime? utcNow = null)
    {
        try
        {
            var targetDirectory = directory ?? SolutionsDirectory;
            if (!Directory.Exists(targetDirectory)) return 0;
            var cutoff = (utcNow ?? DateTime.UtcNow).AddDays(-1);
            var removed = 0;
            foreach (var file in Directory.EnumerateFiles(targetDirectory, ".*.download", SearchOption.TopDirectoryOnly))
            {
                try
                {
                    if (File.GetLastWriteTimeUtc(file) >= cutoff) continue;
                    File.Delete(file);
                    removed++;
                }
                catch
                {
                    // A live download or a read-only file is left untouched.
                }
            }
            return removed;
        }
        catch
        {
            return 0;
        }
    }

    private static bool TryEnsureWritableDirectory(string directory)
    {
        string? probePath = null;
        try
        {
            Directory.CreateDirectory(directory);
            probePath = Path.Combine(directory, $".ivan-ege-write-{Guid.NewGuid():N}.tmp");
            using (new FileStream(probePath, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { }
            File.Delete(probePath);
            return true;
        }
        catch
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(probePath) && File.Exists(probePath)) File.Delete(probePath);
            }
            catch
            {
                // Best effort probe cleanup.
            }
            return false;
        }
    }
}

internal static class LocalWorkbookFiles
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".ods", ".fods",
        ".xlsx", ".xls", ".xlsm", ".xlsb"
    };

    private static readonly HashSet<string> ReservedNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
    };

    public static string SanitizeFileName(string? value)
    {
        var raw = Path.GetFileName((value ?? string.Empty).Trim());
        if (string.IsNullOrWhiteSpace(raw)) raw = "Задание.ods";

        var extension = Path.GetExtension(raw);
        if (!AllowedExtensions.Contains(extension))
        {
            throw new FormatException("Сервер прислал неподдерживаемый формат таблицы.");
        }

        var invalid = Path.GetInvalidFileNameChars().ToHashSet();
        var builder = new StringBuilder(raw.Length);
        foreach (var character in raw)
        {
            builder.Append(invalid.Contains(character) || char.IsControl(character) ? '_' : character);
        }

        var safe = builder.ToString().Trim().TrimEnd('.', ' ');
        var safeExtension = Path.GetExtension(safe);
        var baseName = Path.GetFileNameWithoutExtension(safe).Trim().TrimEnd('.', ' ');
        if (string.IsNullOrWhiteSpace(baseName)) baseName = "Задание";
        if (ReservedNames.Contains(baseName)) baseName = $"_{baseName}";
        if (baseName.Length > 110) baseName = baseName[..110].TrimEnd();
        return baseName + safeExtension.ToLowerInvariant();
    }

    public static string GetUniquePath(string directory, string fileName)
    {
        Directory.CreateDirectory(directory);
        var safeName = SanitizeFileName(fileName);
        var candidate = Path.Combine(directory, safeName);
        if (!File.Exists(candidate)) return candidate;

        var extension = Path.GetExtension(safeName);
        var baseName = Path.GetFileNameWithoutExtension(safeName);
        for (var index = 2; index <= 999; index++)
        {
            candidate = Path.Combine(directory, $"{baseName} ({index}){extension}");
            if (!File.Exists(candidate)) return candidate;
        }

        return Path.Combine(directory, $"{baseName} ({Guid.NewGuid():N}){extension}");
    }
}

internal static class AppLog
{
    private static readonly object Gate = new();

    public static void Info(string message) => Write("INFO", message);
    public static void Error(string message, Exception? error = null) =>
        Write("ERROR", error is null ? message : $"{message}: {error.GetType().Name}: {error.Message}");

    private static void Write(string level, string message)
    {
        try
        {
            lock (Gate)
            {
                AppPaths.EnsureDataDirectories();
                if (File.Exists(AppPaths.LogPath) && new FileInfo(AppPaths.LogPath).Length > 1024 * 1024)
                {
                    File.Move(AppPaths.LogPath, AppPaths.LogPath + ".old", true);
                }
                File.AppendAllText(
                    AppPaths.LogPath,
                    $"{DateTimeOffset.Now:O} [{level}] {message.ReplaceLineEndings(" ")}\r\n",
                    Encoding.UTF8);
            }
        }
        catch
        {
            // Logging must never break synchronization.
        }
    }
}

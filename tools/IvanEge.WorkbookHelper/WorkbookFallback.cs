using System.Diagnostics;

namespace IvanEge.WorkbookHelper;

internal static class WorkbookFallback
{
    public const string Explanation = "Открыта обычная таблица. Ctrl+S автоматически сохраняет файл на доску и в конспекты. На доске остаётся последнее сохранение участников. В этом режиме изменения отдельных ячеек между открытыми окнами не передаются.";

    internal static bool IsCapacityFailure(Exception error) => error is LiveWorkbookCapacityException
        || error is HelperApiException { StatusCode: System.Net.HttpStatusCode.RequestEntityTooLarge };

    internal static async Task<(WorkbookSession Session, string Backup)> WatchAttachedAsync(
        HelperApiClient api, WorkbookGrant grant, LiveOfficeProcess office, Exception error,
        CancellationToken token, string? recoveryDirectory = null, bool startupFailure = false)
    {
        if (!IsCapacityFailure(error) && !startupFailure) throw new InvalidOperationException("Ошибка не относится к размеру общей таблицы", error);
        string initialHash = "";
        if (startupFailure)
        {
            // Initialization may have applied only part of a remote model.
            // Merely entering fallback must not publish that stale/partial
            // workbook. Only the user's next native save changes this hash.
            using var saved = await StableFileSnapshot.CaptureAsync(office.LocalPath, TimeSpan.FromSeconds(5), token);
            initialHash = saved.ContentHash;
        }
        // Retain a complete native export before changing the server mode. Do
        // not read the limited cell model, reopen the source or close the editor.
        string? exported = null;
        try { exported = await office.ExportFileAsync(token, includeMetadata: false); }
        catch (Exception exportError) when (startupFailure && exportError is not OperationCanceledException and not LiveOfficeBusyException && File.Exists(office.LocalPath))
        {
            // If COM itself cannot export, keep the live editor and its unsaved
            // changes open. Back up the last disk save; never call it a fresh export.
            AppLog.Error("Startup fallback could only back up the last native disk save; unsaved editor remains open", exportError);
        }
        string backup;
        try
        {
            string directory = recoveryDirectory ?? Path.Combine(AppPaths.DataDirectory, "recovered");
            Directory.CreateDirectory(directory);
            backup = Path.Combine(directory, (startupFailure ? "startup-workbook-" : "large-workbook-") + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N")[..8] + ".xlsx");
            File.Copy(exported ?? office.LocalPath, backup, overwrite: false);
        }
        finally { if (exported is not null) File.Delete(exported); }
        if (!office.Closed && !startupFailure) await office.CommandAsync(new() { ["type"] = "save-file" }, token);
        await api.LiveRequestAsync(grant, "/workbook-helper/v1/live/fallback", WorkbookOpenFailure.Diagnostic(error, office.EngineName, office.LocalPath), token);
        // Empty initial hash deliberately uploads the complete current file,
        // including edits made since the downloaded checkpoint, once attached.
        var session = new WorkbookSession(api, grant with { Live = null }, office.LocalPath, initialHash,
            (_, _) => Task.FromResult<string?>(null));
        AppLog.Info("Workbook switched to whole-file autosave; startup failure: " + startupFailure + "; recovery: " + backup);
        return (session, backup);
    }

    public static string CreateCopy(string source, Uri origin)
    {
        string name = Path.GetFileNameWithoutExtension(source) + " — обычная копия" + Path.GetExtension(source);
        string target = LocalWorkbookFiles.GetUniquePath(Path.GetDirectoryName(source)!, LocalWorkbookFiles.SanitizeFileName(name));
        File.Copy(source, target, overwrite: false);
        // Ordinary opening must retain the same downloaded-file protections.
        bool marked = MarkOfTheWeb.TryApplyAndVerify(target, origin);
        if (MarkOfTheWeb.IsMacroCapableFileName(target) && !marked)
            throw new InvalidOperationException("Не удалось проверить защитную метку обычной копии. Автоматическое открытие отменено; скачайте файл с платформы вручную.");
        return target;
    }

    public static void Open(string path)
    {
        // Use the user's normal file association. This deliberately does not
        // require Excel COM, which can be absent in otherwise usable editors.
        Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
    }
}

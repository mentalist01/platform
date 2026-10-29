using System.Diagnostics;

namespace IvanEge.WorkbookHelper;

internal static class WorkbookFallback
{
    public const string Explanation = "Открыта обычная таблица. Ctrl+S автоматически сохраняет файл на доску и в конспекты. На доске остаётся последнее сохранение участников. В этом режиме изменения отдельных ячеек между открытыми окнами не передаются.";

    internal static bool IsCapacityFailure(Exception error) => error is LiveWorkbookCapacityException
        || error is HelperApiException { StatusCode: System.Net.HttpStatusCode.RequestEntityTooLarge };

    internal static async Task<(WorkbookSession Session, string Backup)> WatchAttachedAsync(
        HelperApiClient api, WorkbookGrant grant, LiveOfficeProcess office, Exception error,
        CancellationToken token, string? recoveryDirectory = null)
    {
        if (!IsCapacityFailure(error)) throw new InvalidOperationException("Ошибка не относится к размеру общей таблицы", error);
        // Retain a complete native export before changing the server mode. Do
        // not read the limited cell model, reopen the source or close the editor.
        string exported = await office.ExportFileAsync(token);
        string backup;
        try
        {
            string directory = recoveryDirectory ?? Path.Combine(AppPaths.DataDirectory, "recovered");
            Directory.CreateDirectory(directory);
            backup = Path.Combine(directory, "large-workbook-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N")[..8] + ".xlsx");
            File.Copy(exported, backup, overwrite: false);
        }
        finally { File.Delete(exported); }
        if (!office.Closed) await office.CommandAsync(new() { ["type"] = "save" }, token);
        await api.LiveRequestAsync(grant, "/workbook-helper/v1/live/fallback", WorkbookOpenFailure.Diagnostic(error, "auto", office.LocalPath), token);
        // Empty initial hash deliberately uploads the complete current file,
        // including edits made since the downloaded checkpoint, once attached.
        var session = new WorkbookSession(api, grant with { Live = null }, office.LocalPath, "",
            (_, _) => Task.FromResult<string?>(null));
        AppLog.Info("Large workbook switched to whole-file autosave; recovery: " + backup);
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

using System.Diagnostics;

namespace IvanEge.WorkbookHelper;

internal static class WorkbookFallback
{
    public const string Explanation = "Открыта обычная таблица. Ctrl+S автоматически сохраняет файл на доску и в конспекты. На доске остаётся последнее сохранение участников. В этом режиме изменения отдельных ячеек между открытыми окнами не передаются.";

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

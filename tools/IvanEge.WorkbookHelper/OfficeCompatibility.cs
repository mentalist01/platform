using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json.Nodes;

namespace IvanEge.WorkbookHelper;

internal static class OfficeCompatibility
{
    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int AssocQueryStringW(uint flags, uint kind, string association, string verb, StringBuilder? output, ref uint length);

    private static string Association(string extension, uint kind)
    {
        try
        {
            uint length = 0;
            AssocQueryStringW(0, kind, extension, "open", null, ref length);
            if (length is 0 or > 32768) return "";
            var output = new StringBuilder((int)length);
            return AssocQueryStringW(0, kind, extension, "open", output, ref length) == 0 ? output.ToString() : "";
        }
        catch { return ""; }
    }

    public static JsonObject ProgramInfo(string file)
    {
        // Read the existing association only. Never change UserChoice or launch
        // an editor just to identify it; executable paths remain on this PC.
        string extension = Path.GetExtension(file), executable = Association(extension, 2), name = Association(extension, 4);
        string product = "", version = "";
        try
        {
            if (File.Exists(executable))
            {
                var info = FileVersionInfo.GetVersionInfo(executable);
                product = info.ProductName ?? "";
                version = info.FileVersion ?? "";
            }
        }
        catch { }
        return new() { ["programName"] = name, ["programProduct"] = product, ["programVersion"] = version, ["programExecutable"] = Path.GetFileName(executable) };
    }

    internal static string WorkspacePath(string root, string id) => Path.Combine(root, "live-" + id);
    internal static bool NativeDirectorySuitable(string directory) =>
        Path.GetFullPath(directory).Length + 48 <= 218 && !directory.Contains('[') && !directory.Contains(']');

    public static string CreateWorkspace()
    {
        // A nested Desktop/OneDrive path plus a long task filename can exceed
        // Excel's 218-character limit even when ordinary opening still works.
        string directory = WorkspacePath(AppPaths.TempDirectory, Guid.NewGuid().ToString("N")[..16]);
        Directory.CreateDirectory(directory);
        return directory;
    }

    public static string PrepareExcelSource(string source, string directory, Uri? origin)
    {
        string target = LocalWorkbookFiles.GetUniquePath(directory, "input" + Path.GetExtension(source).ToLowerInvariant());
        File.Copy(source, target, overwrite: false);
        if (origin is not null)
        {
            bool marked = MarkOfTheWeb.TryApplyAndVerify(target, origin);
            if (MarkOfTheWeb.IsMacroCapableFileName(target) && !marked)
                throw new InvalidOperationException("Не удалось проверить защитную метку рабочей копии Excel. Исходный файл сохранён.");
        }
        else if (MarkOfTheWeb.IsMacroCapableFileName(target))
            throw new InvalidOperationException("Нет адреса платформы для проверки защитной метки Excel.");
        return target;
    }
}

using System.Runtime.InteropServices;
using System.Text;

namespace IvanEge.WorkbookHelper;

internal static class LiveOfficePreference
{
    private static string PreferencePath => Path.Combine(AppPaths.DataDirectory, "office-program.txt");
    public static string Preferred
    {
        get { try { string value = File.ReadAllText(PreferencePath).Trim(); return value is "excel" or "calc" ? value : "auto"; } catch { return "auto"; } }
        set { AppPaths.EnsureDataDirectories(); File.WriteAllText(PreferencePath, value is "excel" or "calc" ? value : "auto"); }
    }
    internal static string Resolve(string preference, string? associatedProgram, bool excel, bool calc)
    {
        if (preference == "excel" && excel) return "excel";
        if (preference == "calc" && calc) return "calc";
        if (associatedProgram?.Contains("excel", StringComparison.OrdinalIgnoreCase) == true && excel) return "excel";
        if (associatedProgram?.Contains("soffice", StringComparison.OrdinalIgnoreCase) == true && calc) return "calc";
        if (excel) return "excel";
        if (calc) return "calc";
        throw new InvalidOperationException("Не найден Excel или LibreOffice. Установите одну из этих программ для решения таблицы.");
    }
    public static string Choose(string file, string? requested = null)
    {
        bool calc; try { LiveOfficeProcess.FindCalc(); calc = true; } catch { calc = false; }
        var executable = new StringBuilder(2048); uint length = (uint)executable.Capacity;
        string? associated = AssocQueryString(0, 2, Path.GetExtension(file), "open", executable, ref length) == 0 ? executable.ToString() : null;
        bool excel = Type.GetTypeFromProgID("Excel.Application") is not null;
        if (requested == "excel" && !excel || requested == "calc" && !calc) throw new InvalidOperationException("Выбранная программа не установлена на этом компьютере. Выберите Excel или LibreOffice рядом с кнопкой «Решать».");
        return Resolve(requested ?? Preferred, associated, excel, calc);
    }
    [DllImport("Shlwapi.dll", CharSet = CharSet.Unicode, EntryPoint = "AssocQueryStringW")]
    private static extern uint AssocQueryString(uint flags, uint kind, string association, string extra, StringBuilder output, ref uint length);
}

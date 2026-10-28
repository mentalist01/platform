using System.Diagnostics;
using Microsoft.Win32;

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
        if (calc) return "calc";
        if (excel) return "excel";
        throw new InvalidOperationException("Не найден Excel или LibreOffice. Установите одну из этих программ для решения таблицы.");
    }
    public static string Choose(string file, string? requested = null)
    {
        bool calc; try { LiveOfficeProcess.FindCalc(); calc = true; } catch { calc = false; }
        bool excel = Type.GetTypeFromProgID("Excel.Application") is not null;
        if (requested == "excel" && !excel || requested == "calc" && !calc) throw new InvalidOperationException("Выбранная программа не установлена на этом компьютере. Выберите Excel или LibreOffice рядом с кнопкой «Решать».");
        return Resolve(requested ?? Preferred, null, excel, calc);
    }

    public static void OpenSeparateWorkbook(string file)
    {
        var engine = Choose(file);
        if (engine == "calc")
        {
            var start = new ProcessStartInfo(Path.Combine(LiveOfficeProcess.FindCalc(), "soffice.exe")) { UseShellExecute = false };
            start.ArgumentList.Add("--calc");
            start.ArgumentList.Add(file);
            Process.Start(start);
            return;
        }
        foreach (var hive in new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine })
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            using var registry = RegistryKey.OpenBaseKey(hive, view);
            using var key = registry.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\App Paths\excel.exe");
            var executable = (key?.GetValue(null) as string)?.Trim('"');
            if (string.IsNullOrWhiteSpace(executable) || !File.Exists(executable)) continue;
            var start = new ProcessStartInfo(executable) { UseShellExecute = false };
            start.ArgumentList.Add(file);
            Process.Start(start);
            return;
        }
        Process.Start(new ProcessStartInfo(file) { UseShellExecute = true });
    }
}

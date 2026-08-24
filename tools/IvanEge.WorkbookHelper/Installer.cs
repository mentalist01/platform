using Microsoft.Win32;
using System.Diagnostics;

namespace IvanEge.WorkbookHelper;

internal sealed record InstallOutcome(bool ExitCurrentProcess, bool WasInstalled);

internal static class Installer
{
    private const string ProtocolName = "ivan-ege";

    public static InstallOutcome EnsureInstalledAndRegistered(string[] originalArguments)
    {
        // MSIX/Microsoft Store owns installation and protocol registration. A packaged
        // process must never copy itself out of the signed package or rewrite HKCU.
        if (PackageIdentity.IsPackaged)
        {
            return new InstallOutcome(false, false);
        }

        var currentExecutable = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(currentExecutable))
        {
            throw new InvalidOperationException("Не удалось определить путь к помощнику.");
        }

        var installedExecutable = AppPaths.InstalledExecutablePath;
        if (PathsEqual(currentExecutable, installedExecutable))
        {
            Register(installedExecutable);
            return new InstallOutcome(false, false);
        }

        var installChoice = MessageBox.Show(
            "Помощник установится только для вашей учётной записи Windows.\n\n"
            + "Он скопирует программу в локальную папку «Иван на сотку» и зарегистрирует ссылку ivan-ege:, "
            + "чтобы кнопка «Решать» могла открывать Excel или LibreOffice. Права администратора и автозапуск не используются.\n\n"
            + "Продолжить установку?",
            "Установка помощника «Иван на сотку»",
            MessageBoxButtons.OKCancel,
            MessageBoxIcon.Information,
            MessageBoxDefaultButton.Button2);
        if (installChoice != DialogResult.OK)
        {
            return new InstallOutcome(true, false);
        }

        Directory.CreateDirectory(AppPaths.InstallDirectory);
        var temporaryExecutable = installedExecutable + $".{Guid.NewGuid():N}.new";
        try
        {
            File.Copy(currentExecutable, temporaryExecutable, true);
            File.Move(temporaryExecutable, installedExecutable, true);
        }
        catch (Exception error) when (IsExistingInstallFallback(error, File.Exists(installedExecutable)))
        {
            // An older installed copy can be running. It is still safer to launch it than to fail installation.
            TryDelete(temporaryExecutable);
        }
        catch
        {
            TryDelete(temporaryExecutable);
            throw;
        }

        Register(installedExecutable);

        var startInfo = new ProcessStartInfo
        {
            FileName = installedExecutable,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = AppPaths.InstallDirectory
        };
        foreach (var argument in originalArguments.Where(argument => !string.Equals(argument, "--install", StringComparison.OrdinalIgnoreCase)))
        {
            startInfo.ArgumentList.Add(argument);
        }
        if (!originalArguments.Any(argument => string.Equals(argument, "--notify-installed", StringComparison.OrdinalIgnoreCase)))
        {
            startInfo.ArgumentList.Add("--notify-installed");
        }
        Process.Start(startInfo);
        return new InstallOutcome(true, true);
    }

    public static void Register(string executablePath)
    {
        var quotedExecutable = $"\"{executablePath}\"";
        using (var protocolKey = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{ProtocolName}"))
        {
            protocolKey.SetValue(null, "URL:Ivan EGE Workbook Helper", RegistryValueKind.String);
            protocolKey.SetValue("URL Protocol", string.Empty, RegistryValueKind.String);
        }
        using (var iconKey = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{ProtocolName}\DefaultIcon"))
        {
            iconKey.SetValue(null, $"{quotedExecutable},0", RegistryValueKind.String);
        }
        using (var commandKey = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{ProtocolName}\shell\open\command"))
        {
            commandKey.SetValue(null, $"{quotedExecutable} --uri \"%1\"", RegistryValueKind.String);
        }
    }

    private static bool PathsEqual(string left, string right)
    {
        try
        {
            return string.Equals(Path.GetFullPath(left), Path.GetFullPath(right), StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    internal static bool IsExistingInstallFallback(Exception error, bool installedExecutableExists) =>
        installedExecutableExists && error is IOException or UnauthorizedAccessException;

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch
        {
            // Best effort cleanup.
        }
    }
}

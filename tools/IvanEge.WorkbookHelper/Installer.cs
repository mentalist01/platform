using Microsoft.Win32;
using System.Diagnostics;
using System.Security.Cryptography;

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
            + "Обновления будут проверяться и скачиваться с ivan100.ru автоматически. Установка не прерывает работу с общей таблицей; настройка доступна в меню значка возле часов.\n\n"
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
        while (true)
        {
            try { CopyForInstall(currentExecutable, installedExecutable); break; }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
                AppLog.Error("Manual helper update was not installed", error);
                var installedVersion = File.Exists(installedExecutable)
                    ? FileVersionInfo.GetVersionInfo(installedExecutable).FileVersion : "не установлена";
                var retry = MessageBox.Show(
                    $"Новая версия {HelperUpdater.CurrentVersion.ToString(3)} пока не установлена. Текущая версия: {installedVersion}.\n\n"
                    + "Сохраните открытые таблицы через Ctrl+S. В значке прежнего помощника рядом с часами выберите «Выход», затем нажмите «Повторить».\n\n"
                    + "Если ошибка повторится, проверьте доступ к папке установки и свободное место. Старую версию программа не будет выдавать за обновлённую.",
                    "Не удалось обновить помощник", MessageBoxButtons.RetryCancel, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
                if (retry != DialogResult.Retry) return new InstallOutcome(true, false);
            }
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

    internal static void CopyForInstall(string source, string destination)
    {
        static byte[] Hash(string file) { using var stream = File.OpenRead(file); return SHA256.HashData(stream); }
        var expected = Hash(source);
        if (File.Exists(destination) && CryptographicOperations.FixedTimeEquals(expected, Hash(destination))) return;
        var temporary = destination + $".{Guid.NewGuid():N}.new";
        FileAttributes? previousAttributes = null;
        var replaced = false;
        try
        {
            File.Copy(source, temporary, true);
            MakeWritable(temporary);
            if (!CryptographicOperations.FixedTimeEquals(expected, Hash(temporary))) throw new IOException("Копия установщика повреждена.");
            if (File.Exists(destination)) previousAttributes = MakeWritable(destination);
            File.Move(temporary, destination, true);
            replaced = true;
            if (!CryptographicOperations.FixedTimeEquals(expected, Hash(destination))) throw new IOException("Установленная программа отличается от новой версии.");
        }
        finally
        {
            if (!replaced && previousAttributes is { } attributes && File.Exists(destination))
                File.SetAttributes(destination, attributes);
            TryDelete(temporary);
        }
    }

    internal static FileAttributes MakeWritable(string path)
    {
        var attributes = File.GetAttributes(path);
        if ((attributes & FileAttributes.ReadOnly) != 0)
            File.SetAttributes(path, attributes & ~FileAttributes.ReadOnly);
        return attributes;
    }

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

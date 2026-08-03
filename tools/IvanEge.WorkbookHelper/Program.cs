namespace IvanEge.WorkbookHelper;

internal static class Program
{
    [STAThread]
    private static int Main(string[] arguments)
    {
        if (arguments.Any(argument => string.Equals(argument, "--self-test", StringComparison.OrdinalIgnoreCase)))
        {
            return SelfTest.Run();
        }

        try
        {
            AppPaths.EnsureDataDirectories();
            AppPaths.CleanupStaleTemporaryFiles();
            AppPaths.CleanupStaleSolutionDownloads();
            var install = Installer.EnsureInstalledAndRegistered(arguments);
            if (install.ExitCurrentProcess) return 0;

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.ThreadException += (_, eventArgs) =>
            {
                AppLog.Error("Unhandled UI error", eventArgs.Exception);
                MessageBox.Show(
                    "Помощник столкнулся с ошибкой. Нажмите «Решать» на платформе ещё раз.",
                    "Иван на сотку",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            };
            TaskScheduler.UnobservedTaskException += (_, eventArgs) =>
            {
                AppLog.Error("Unobserved task error", eventArgs.Exception);
                eventArgs.SetObserved();
            };

            using var singleInstance = SingleInstance.Create();
            var protocolRequests = ExtractProtocolRequests(arguments);
            if (!singleInstance.IsPrimary)
            {
                var messages = protocolRequests.Count > 0
                    ? protocolRequests
                    : [TrayApplicationContext.ActivationMessage];
                var forwarded = true;
                foreach (var message in messages)
                {
                    forwarded &= singleInstance.ForwardAsync(message).GetAwaiter().GetResult();
                }
                if (!forwarded)
                {
                    MessageBox.Show(
                        "Помощник уже запущен, но не смог принять новую команду. Закройте его значок рядом с часами и попробуйте снова.",
                        "Иван на сотку",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                    return 2;
                }
                return 0;
            }

            var notifyInstalled = arguments.Any(argument => string.Equals(argument, "--notify-installed", StringComparison.OrdinalIgnoreCase));
            using var context = new TrayApplicationContext(singleInstance, protocolRequests, notifyInstalled);
            Application.Run(context);
            return 0;
        }
        catch (Exception error)
        {
            AppLog.Error("Helper startup failed", error);
            MessageBox.Show(
                $"Не удалось запустить помощник.\n\n{error.Message}",
                "Иван на сотку",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }

    private static List<string> ExtractProtocolRequests(IReadOnlyList<string> arguments)
    {
        var result = new List<string>();
        for (var index = 0; index < arguments.Count; index++)
        {
            var argument = arguments[index]?.Trim() ?? string.Empty;
            if (string.Equals(argument, "--uri", StringComparison.OrdinalIgnoreCase) && index + 1 < arguments.Count)
            {
                var value = arguments[++index]?.Trim() ?? string.Empty;
                if (value.StartsWith("ivan-ege:", StringComparison.OrdinalIgnoreCase)) result.Add(value);
                continue;
            }
            if (argument.StartsWith("ivan-ege:", StringComparison.OrdinalIgnoreCase)) result.Add(argument);
        }
        return result;
    }
}

using System.Drawing;

namespace IvanEge.WorkbookHelper;

internal static class WorkbookOpenFailure
{
    public static System.Text.Json.Nodes.JsonObject Diagnostic(Exception error, string engine, string? source = null)
    {
        string message = error.Message;
        var code = System.Text.RegularExpressions.Regex.Match(message, @"0x[\da-fA-F]{8}").Value;
        string stage = message.StartsWith("Не удалось открыть общую таблицу в ", StringComparison.Ordinal)
            ? message.Split('\n')[0] : error.GetType().Name;
        // Send startup metadata only. Raw native messages and local paths stay local.
        stage = System.Text.RegularExpressions.Regex.Replace(stage, @"(?:[A-Za-z]:\\|https?://|ticket=|token=).*", "[redacted]", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        string summary = System.Text.RegularExpressions.Regex.Replace(message, @"(?:[A-Za-z]:\\|https?://|ticket=|token=)[^\r\n]*", "[redacted]", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        var result = new System.Text.Json.Nodes.JsonObject { ["version"] = HelperUpdater.CurrentVersion.ToString(3), ["engine"] = engine, ["code"] = code,
            ["stage"] = stage[..Math.Min(stage.Length, 100)], ["kind"] = error.GetType().Name, ["summary"] = summary[..Math.Min(summary.Length, 500)] };
        if (source is not null) foreach (var item in OfficeCompatibility.ProgramInfo(source)) result[item.Key] = item.Value?.DeepClone();
        return result;
    }
    public static string AtStage(string program, string stage, Exception error) =>
        $"{program}: {stage}.\n{error.Message}\nКод ошибки: 0x{unchecked((uint)error.HResult):X8}";

    public static string Details(string message) =>
        $"Помощник таблиц {HelperUpdater.CurrentVersion.ToString(3)}\n\n{message}";
}

// A launch failure must remain visible even when Windows suppresses tray
// balloons. This window is only shown after a failed launch/closed live bridge.
internal sealed class WorkbookOpenFailureWindow : Form
{
    private readonly TextBox _details;
    private readonly Label _heading;
    public WorkbookOpenFailureWindow()
    {
        Text = "Не удалось открыть таблицу · Иван на сотку";
        ClientSize = new Size(560, 305);
        MinimumSize = new Size(440, 260);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(250, 248, 255);
        Font = new Font("Segoe UI", 10);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(18), ColumnCount = 1, RowCount = 3 };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        _heading = new Label { AutoSize = true, Text = "Таблица не открылась", ForeColor = Color.FromArgb(185, 28, 28), Font = new Font(Font, FontStyle.Bold), Margin = new Padding(0, 0, 0, 12) };
        layout.Controls.Add(_heading);
        _details = new TextBox { Dock = DockStyle.Fill, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, BackColor = Color.White };
        layout.Controls.Add(_details);
        var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Margin = new Padding(0, 12, 0, 0) };
        var close = new Button { Text = "Закрыть", AutoSize = true };
        close.Click += (_, _) => Close();
        var copy = new Button { Text = "Скопировать ошибку", AutoSize = true };
        copy.Click += (_, _) => { try { Clipboard.SetText(_details.Text); } catch (Exception error) { AppLog.Error("Could not copy workbook launch error", error); } };
        actions.Controls.Add(close);
        actions.Controls.Add(copy);
        layout.Controls.Add(actions);
        Controls.Add(layout);
        AcceptButton = close;
        CancelButton = close;
    }

    public void Present(string message, bool ordinaryCopy = false)
    {
        Text = ordinaryCopy ? "Открыта обычная копия · Иван на сотку" : "Не удалось открыть таблицу · Иван на сотку";
        _heading.Text = ordinaryCopy ? "Можно продолжить в обычном режиме" : "Таблица не открылась";
        _heading.ForeColor = ordinaryCopy ? Color.FromArgb(146, 64, 14) : Color.FromArgb(185, 28, 28);
        _details.Text = WorkbookOpenFailure.Details(message);
        _details.Select(0, 0);
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Show();
        Activate();
    }
}

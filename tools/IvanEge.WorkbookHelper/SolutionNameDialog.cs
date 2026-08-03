using System.Drawing;

namespace IvanEge.WorkbookHelper;

internal static class SolutionNameRules
{
    public const int MaxLength = 100;

    private static readonly HashSet<string> WorkbookExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".ods", ".fods", ".xlsx", ".xls", ".xlsm", ".xlsb"
    };

    private static readonly HashSet<string> ReservedNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
    };

    public static bool TryNormalize(string? value, out string normalized, out string error)
    {
        var raw = value ?? string.Empty;
        normalized = string.Empty;
        if (raw.Any(char.IsControl))
        {
            error = "В названии есть недопустимый служебный символ.";
            return false;
        }

        normalized = string.Join(' ', raw.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        var extension = Path.GetExtension(normalized);
        if (WorkbookExtensions.Contains(extension))
        {
            normalized = normalized[..^extension.Length].Trim();
        }

        if (string.IsNullOrWhiteSpace(normalized))
        {
            error = "Введите название работы.";
            return false;
        }
        if (normalized.Length > MaxLength)
        {
            error = $"Не больше {MaxLength} символов.";
            return false;
        }
        if (normalized.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || normalized.Any(char.IsControl))
        {
            error = "Нельзя использовать символы \\ / : * ? \" < > |.";
            return false;
        }
        if (normalized.EndsWith('.') || ReservedNames.Contains(normalized.Split('.')[0]))
        {
            error = "Выберите другое название файла.";
            return false;
        }

        error = string.Empty;
        return true;
    }

    public static string NormalizeSuggestion(string? value) =>
        TryNormalize(value, out var normalized, out _) ? normalized : string.Empty;
}

internal sealed class SolutionNameDialog : Form
{
    private readonly TextBox _nameBox;
    private readonly Label _validationLabel;
    private readonly Button _saveButton;

    public SolutionNameDialog(string? suggestion)
    {
        Text = "Название решённой работы";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        TopMost = true;
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(470, 245);
        BackColor = Color.White;
        Font = new Font("Segoe UI", 10F, FontStyle.Regular, GraphicsUnit.Point);

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(24, 20, 24, 18),
            ColumnCount = 1,
            RowCount = 5,
            BackColor = Color.White
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var title = new Label
        {
            Text = "Как назвать решённую работу?",
            Dock = DockStyle.Fill,
            AutoSize = false,
            Font = new Font("Segoe UI Semibold", 15F, FontStyle.Bold, GraphicsUnit.Point),
            ForeColor = Color.FromArgb(31, 27, 46),
            TextAlign = ContentAlignment.MiddleLeft
        };
        var description = new Label
        {
            Text = "Это название будет видно в конспектах. Расширение файла платформа добавит сама.",
            Dock = DockStyle.Fill,
            AutoSize = false,
            ForeColor = Color.FromArgb(98, 91, 122),
            TextAlign = ContentAlignment.MiddleLeft
        };
        _nameBox = new TextBox
        {
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 11F, FontStyle.Regular, GraphicsUnit.Point),
            MaxLength = SolutionNameRules.MaxLength + 6,
            Text = SolutionNameRules.NormalizeSuggestion(suggestion),
            Margin = new Padding(0, 4, 0, 2)
        };
        _validationLabel = new Label
        {
            Dock = DockStyle.Fill,
            AutoSize = false,
            ForeColor = Color.FromArgb(184, 51, 78),
            Font = new Font("Segoe UI", 8.5F, FontStyle.Regular, GraphicsUnit.Point),
            TextAlign = ContentAlignment.MiddleLeft
        };

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Padding = new Padding(0, 8, 0, 0)
        };
        _saveButton = new Button
        {
            Text = "Сохранить",
            AutoSize = false,
            Size = new Size(122, 38),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(126, 52, 238),
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 9.5F, FontStyle.Bold, GraphicsUnit.Point),
            Margin = new Padding(8, 0, 0, 0),
            Cursor = Cursors.Hand
        };
        _saveButton.FlatAppearance.BorderSize = 0;
        var cancelButton = new Button
        {
            Text = "Не сейчас",
            AutoSize = false,
            Size = new Size(112, 38),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.White,
            ForeColor = Color.FromArgb(75, 67, 101),
            DialogResult = DialogResult.Cancel,
            Margin = new Padding(8, 0, 0, 0),
            Cursor = Cursors.Hand
        };
        cancelButton.FlatAppearance.BorderColor = Color.FromArgb(218, 211, 231);

        _nameBox.TextChanged += (_, _) => UpdateValidation();
        _saveButton.Click += (_, _) => SaveAndClose();
        buttons.Controls.Add(_saveButton);
        buttons.Controls.Add(cancelButton);
        root.Controls.Add(title, 0, 0);
        root.Controls.Add(description, 0, 1);
        root.Controls.Add(_nameBox, 0, 2);
        root.Controls.Add(_validationLabel, 0, 3);
        root.Controls.Add(buttons, 0, 4);
        Controls.Add(root);

        AcceptButton = _saveButton;
        CancelButton = cancelButton;
        Shown += (_, _) =>
        {
            _nameBox.Focus();
            _nameBox.SelectAll();
            UpdateValidation();
        };
        UpdateValidation();
    }

    public string SolutionName { get; private set; } = string.Empty;

    private void UpdateValidation()
    {
        var valid = SolutionNameRules.TryNormalize(_nameBox.Text, out _, out var error);
        _saveButton.Enabled = valid;
        _validationLabel.Text = valid ? string.Empty : error;
        _saveButton.BackColor = valid
            ? Color.FromArgb(126, 52, 238)
            : Color.FromArgb(194, 179, 218);
    }

    private void SaveAndClose()
    {
        if (!SolutionNameRules.TryNormalize(_nameBox.Text, out var normalized, out var error))
        {
            _validationLabel.Text = error;
            return;
        }
        SolutionName = normalized;
        DialogResult = DialogResult.OK;
        Close();
    }
}

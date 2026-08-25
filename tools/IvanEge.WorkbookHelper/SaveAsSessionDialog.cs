using System.Drawing;

namespace IvanEge.WorkbookHelper;

internal sealed class SaveAsSessionDialog : Form
{
    private readonly ComboBox _sessionBox;

    public SaveAsSessionDialog(string candidatePath, IReadOnlyList<WorkbookSession> sessions)
    {
        if (sessions.Count < 2) throw new ArgumentException("At least two sessions are required.", nameof(sessions));
        Text = "К какой работе относится файл?";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        TopMost = true;
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(520, 260);
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
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        root.Controls.Add(new Label
        {
            Text = "Excel сохранил новую копию",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI Semibold", 15F, FontStyle.Bold, GraphicsUnit.Point),
            ForeColor = Color.FromArgb(31, 27, 46),
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, 0);
        root.Controls.Add(new Label
        {
            Text = $"Файл «{Path.GetFileName(candidatePath)}» нужно продолжить сохранять на платформу. Выберите исходную работу:",
            Dock = DockStyle.Fill,
            ForeColor = Color.FromArgb(98, 91, 122),
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, 1);
        root.Controls.Add(new Label
        {
            Text = "Открытая работа",
            Dock = DockStyle.Fill,
            ForeColor = Color.FromArgb(75, 67, 101),
            Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold, GraphicsUnit.Point),
            TextAlign = ContentAlignment.BottomLeft
        }, 0, 2);

        _sessionBox = new ComboBox
        {
            Dock = DockStyle.Fill,
            DropDownStyle = ComboBoxStyle.DropDownList,
            Font = new Font("Segoe UI", 10.5F, FontStyle.Regular, GraphicsUnit.Point),
            DisplayMember = nameof(SessionChoice.Label)
        };
        foreach (var session in sessions)
        {
            _sessionBox.Items.Add(new SessionChoice(session, session.FileName));
        }
        _sessionBox.SelectedIndex = sessions.Count - 1;
        root.Controls.Add(_sessionBox, 0, 3);

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Padding = new Padding(0, 10, 0, 0)
        };
        var continueButton = new Button
        {
            Text = "Продолжить синхронизацию",
            AutoSize = false,
            Size = new Size(198, 38),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(126, 52, 238),
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 9.5F, FontStyle.Bold, GraphicsUnit.Point),
            DialogResult = DialogResult.OK,
            Margin = new Padding(8, 0, 0, 0),
            Cursor = Cursors.Hand
        };
        continueButton.FlatAppearance.BorderSize = 0;
        var cancelButton = new Button
        {
            Text = "Не связывать",
            AutoSize = false,
            Size = new Size(128, 38),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.White,
            ForeColor = Color.FromArgb(75, 67, 101),
            DialogResult = DialogResult.Cancel,
            Margin = new Padding(8, 0, 0, 0),
            Cursor = Cursors.Hand
        };
        cancelButton.FlatAppearance.BorderColor = Color.FromArgb(218, 211, 231);
        buttons.Controls.Add(continueButton);
        buttons.Controls.Add(cancelButton);
        root.Controls.Add(buttons, 0, 4);
        Controls.Add(root);

        AcceptButton = continueButton;
        CancelButton = cancelButton;
    }

    public WorkbookSession? SelectedSession =>
        (_sessionBox.SelectedItem as SessionChoice)?.Session;

    private sealed record SessionChoice(WorkbookSession Session, string Label);
}

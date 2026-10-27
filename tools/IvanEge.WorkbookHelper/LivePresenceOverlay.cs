using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace IvanEge.WorkbookHelper;

// This click-through window belongs to the helper, not the document. Presence
// cannot be saved into XLSX, pollute undo, change cells or steal the selection.
internal sealed class LivePresenceOverlay : Form
{
    private readonly System.Windows.Forms.Timer _timer;
    private JsonObject? _frame;
    private JsonArray _peers = [];
    private long _updated;
    private nint _owner;
    protected override bool ShowWithoutActivation => true;
    protected override CreateParams CreateParams
    {
        get { var value = base.CreateParams; value.ExStyle |= 0x08000000 | 0x00000020 | 0x00080000 | 0x00000080; return value; }
    }
    public LivePresenceOverlay()
    {
        Text = "Совместное выделение · Иван на сотку";
        FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true; StartPosition = FormStartPosition.Manual;
        BackColor = Color.Lime; TransparencyKey = Color.Lime; DoubleBuffered = true; AutoScaleMode = AutoScaleMode.None;
        _timer = new System.Windows.Forms.Timer { Interval = 100 };
        _timer.Tick += (_, _) => RefreshVisibility(); _timer.Start();
    }
    public void Present(JsonObject frame, JsonArray peers)
    {
        _frame = frame; _peers = peers; _updated = Environment.TickCount64;
        long owner = frame["window"]?.GetValue<long>() ?? 0; _owner = (nint)(owner < 0 ? unchecked((uint)owner) : owner);
        RefreshVisibility(); Invalidate();
    }
    private void RefreshVisibility()
    {
        bool visible = _owner != 0 && _peers.Count > 0 && _frame?["view"] is JsonArray && Environment.TickCount64 - _updated < 1800 &&
            GetAncestor(GetForegroundWindow(), 2) == GetAncestor(_owner, 2) && !IsIconic(_owner) && GetWindowRect(_owner, out _);
        if (!visible) { if (Visible) Hide(); return; }
        GetWindowRect(_owner, out var rect); Bounds = Rectangle.FromLTRB(rect.Left, rect.Top, rect.Right, rect.Bottom);
        if (!Visible) Show();
    }
    protected override void WndProc(ref Message message)
    {
        if (message.Msg == 0x84) { message.Result = (nint)(-1); return; } // HTTRANSPARENT
        if (message.Msg == 0x21) { message.Result = (nint)3; return; } // MA_NOACTIVATE
        base.WndProc(ref message);
    }
    private Rectangle LocalRect(JsonArray value) => new(value[0]!.GetValue<int>() - Left, value[1]!.GetValue<int>() - Top, value[2]!.GetValue<int>(), value[3]!.GetValue<int>());
    protected override void OnPaint(PaintEventArgs args)
    {
        base.OnPaint(args); if (_frame is null) return;
        var graphics = args.Graphics; graphics.SmoothingMode = SmoothingMode.None;
        if (_frame["view"] is not JsonArray view) return;
        var viewport = LocalRect(view); graphics.SetClip(viewport);
        var labeled = new HashSet<string>();
        foreach (var mark in (_frame["marks"] as JsonArray ?? []).Take(64))
        {
            if (mark?["bounds"] is not JsonArray values) continue;
            var bounds = LocalRect(values); if (bounds.Width <= 0 || bounds.Height <= 0) continue;
            string name = mark["name"]!.GetValue<string>(); var color = ColorTranslator.FromHtml(mark["color"]!.GetValue<string>());
            using var pen = new Pen(color, 2); graphics.DrawRectangle(pen, bounds.X + 1, bounds.Y + 1, Math.Max(0, bounds.Width - 2), Math.Max(0, bounds.Height - 2));
            if (labeled.Add(name)) Label(graphics, name, color, Math.Clamp(bounds.X, viewport.Left, Math.Max(viewport.Left, viewport.Right - 150)), Math.Max(viewport.Top, bounds.Y - 23));
        }
        int chipY = viewport.Top + 6;
        foreach (var peer in _peers.Take(8))
        {
            string name = peer!["name"]!.GetValue<string>();
            if (labeled.Contains(name)) continue;
            var selection = peer["selection"]!;
            string text = name + " · " + selection["sheetName"]!.GetValue<string>();
            if (selection["objects"] is JsonArray objects && objects.Count > 0) text += " · " + objects[0]!["name"]!.GetValue<string>();
            else if (selection["ranges"] is JsonArray ranges && ranges.Count > 0) text += " · " + RangeText(ranges[0]!.AsArray());
            Label(graphics, text, ColorTranslator.FromHtml(peer["color"]!.GetValue<string>()), Math.Max(viewport.Left + 5, viewport.Right - 270), chipY); chipY += 25;
        }
    }
    private static string RangeText(JsonArray range)
    {
        static string Cell(int row, int column) { string letters = ""; for (int n = column + 1; n > 0; n = (n - 1) / 26) letters = (char)('A' + (n - 1) % 26) + letters; return letters + (row + 1); }
        string first = Cell(range[0]!.GetValue<int>(), range[1]!.GetValue<int>()), last = Cell(range[2]!.GetValue<int>(), range[3]!.GetValue<int>());
        return first == last ? first : first + ":" + last;
    }
    private void Label(Graphics graphics, string text, Color color, int x, int y)
    {
        using var font = new Font("Segoe UI", 9, FontStyle.Bold);
        if (text.Length > 48) text = text[..45] + "…";
        var size = graphics.MeasureString(text, font); var rect = new RectangleF(x, y, size.Width + 14, 22);
        using var brush = new SolidBrush(color); graphics.FillRectangle(brush, rect); graphics.DrawString(text, font, Brushes.White, x + 7, y + 3);
    }
    protected override void Dispose(bool disposing) { if (disposing) _timer.Dispose(); base.Dispose(disposing); }
    [StructLayout(LayoutKind.Sequential)] private struct NativeRect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern nint GetAncestor(nint window, uint flags);
    [DllImport("user32.dll")] private static extern bool IsIconic(nint window);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint window, out NativeRect rect);
}

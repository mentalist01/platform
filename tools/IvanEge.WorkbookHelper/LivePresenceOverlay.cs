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
    private nint _owner, _attachedOwner;
    private JsonObject? _hovered;
    private Point _hoverPoint;
    protected override bool ShowWithoutActivation => true;
    protected override CreateParams CreateParams
    {
        get { var value = base.CreateParams; value.ExStyle |= 0x08000000 | 0x00000020 | 0x00080000 | 0x00000080; return value; }
    }
    public LivePresenceOverlay()
    {
        Text = "Совместное выделение · Иван на сотку";
        FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = false; StartPosition = FormStartPosition.Manual;
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
        nint owner = _owner == 0 ? 0 : GetAncestor(_owner, 2);
        bool visible = owner != 0 && _peers.Count > 0 && _frame?["view"] is JsonArray && Environment.TickCount64 - _updated < 1800 &&
            IsWindowVisible(owner) && !IsIconic(owner) && GetWindowRect(owner, out _);
        if (!visible) { if (Visible) Hide(); return; }
        // A non-topmost owned window follows only this spreadsheet in the native
        // z-order. Losing keyboard focus keeps marks visible on uncovered cells,
        // while another application can cover both workbook and marks normally.
        if (_attachedOwner != owner) { SetWindowLongPtr(Handle, -8, owner); _attachedOwner = owner; }
        GetWindowRect(owner, out var rect); Bounds = Rectangle.FromLTRB(rect.Left, rect.Top, rect.Right, rect.Bottom);
        if (!Visible) Show();
        RefreshHover(owner);
    }
    internal static JsonObject? HitTest(JsonObject? frame, Point screen)
    {
        static bool Contains(JsonArray box, Point point) => new Rectangle(box[0]!.GetValue<int>(), box[1]!.GetValue<int>(), box[2]!.GetValue<int>(), box[3]!.GetValue<int>()).Contains(point);
        if (frame?["view"] is not JsonArray view || !Contains(view, screen)) return null;
        return (frame["marks"] as JsonArray ?? []).Reverse().FirstOrDefault(mark => mark?["bounds"] is JsonArray bounds && Contains(bounds, screen))?.AsObject();
    }
    private void RefreshHover(nint owner)
    {
        JsonObject? hovered = null; var point = Point.Empty;
        if (GetCursorPos(out var cursor))
        {
            nint underPointer = GetAncestor(WindowFromPoint(cursor), 2);
            if (underPointer == owner || underPointer == Handle) hovered = HitTest(_frame, new Point(cursor.X, cursor.Y));
            point = new Point(cursor.X - Left, cursor.Y - Top);
        }
        if (!JsonNode.DeepEquals(hovered, _hovered) || _hovered is not null && point != _hoverPoint)
        { _hovered = hovered; _hoverPoint = point; Invalidate(); }
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
        var marked = new HashSet<string>();
        foreach (var mark in (_frame["marks"] as JsonArray ?? []).Take(64))
        {
            if (mark?["bounds"] is not JsonArray values) continue;
            var bounds = LocalRect(values); if (bounds.Width <= 0 || bounds.Height <= 0) continue;
            string colorText = mark["color"]!.GetValue<string>(); var color = ColorTranslator.FromHtml(colorText);
            using var pen = new Pen(color, 2); graphics.DrawRectangle(pen, bounds.X + 1, bounds.Y + 1, Math.Max(0, bounds.Width - 2), Math.Max(0, bounds.Height - 2));
            using var marker = new SolidBrush(color); graphics.FillRectangle(marker, bounds.X, bounds.Y, Math.Min(4, bounds.Width), Math.Min(4, bounds.Height));
            marked.Add(colorText);
            if (mark["draft"] is JsonValue draft) Preview(graphics, draft.GetValue<string>(), color, bounds, viewport);
        }
        int chipY = viewport.Top + 6;
        foreach (var peer in _peers.Take(8))
        {
            if (marked.Contains(peer!["color"]!.GetValue<string>())) continue;
            if (peer["draft"] is JsonObject draft)
            {
                Preview(graphics, draft["text"]!.GetValue<string>(), ColorTranslator.FromHtml(peer["color"]!.GetValue<string>()), new Rectangle(viewport.Right - 320, chipY, 300, 0), viewport);
                chipY += 92;
            }
        }
        if (_hovered is not null)
        {
            string name = _hovered["name"]!.GetValue<string>(); if (name.Length > 48) name = name[..45] + "…";
            var color = ColorTranslator.FromHtml(_hovered["color"]!.GetValue<string>());
            using var font = new Font("Segoe UI", 9); var measured = graphics.MeasureString(name, font);
            int width = Math.Min((int)Math.Ceiling(measured.Width) + 16, Math.Max(40, viewport.Width - 8)), height = 23;
            int x = Math.Clamp(_hoverPoint.X + 12, viewport.Left + 4, Math.Max(viewport.Left + 4, viewport.Right - width - 4));
            int y = _hoverPoint.Y + height + 20 < viewport.Bottom ? _hoverPoint.Y + 17 : Math.Max(viewport.Top + 4, _hoverPoint.Y - height - 5);
            using var fill = new SolidBrush(Color.FromArgb(250, 248, 255)); using var border = new Pen(color); using var ink = new SolidBrush(Color.FromArgb(42, 36, 65));
            graphics.FillRectangle(fill, x, y, width, height); graphics.DrawRectangle(border, x, y, width, height);
            graphics.DrawString(name, font, ink, new RectangleF(x + 8, y + 4, width - 12, height - 4));
        }
    }
    private static void Preview(Graphics graphics, string text, Color color, Rectangle cell, Rectangle viewport)
    {
        if (text.Length > 240) text = text[..237] + "…";
        int width = Math.Min(340, Math.Max(80, viewport.Width - 12));
        using var font = new Font("Segoe UI", 10);
        string label = "Ввод…\n" + (text.Length == 0 ? "Пустой черновик" : text);
        int height = Math.Min(88, Math.Max(47, (int)graphics.MeasureString(label, font, width - 20).Height + 16));
        int x = Math.Clamp(cell.Left, viewport.Left + 4, Math.Max(viewport.Left + 4, viewport.Right - width - 4));
        int y = cell.Bottom + height + 5 <= viewport.Bottom ? cell.Bottom + 5 : Math.Max(viewport.Top + 4, cell.Top - height - 5);
        using var fill = new SolidBrush(Color.FromArgb(248, 247, 255)); using var border = new Pen(color, 2); using var ink = new SolidBrush(Color.FromArgb(42, 36, 65));
        graphics.FillRectangle(fill, x, y, width, height); graphics.DrawRectangle(border, x, y, width, height);
        graphics.DrawString(label, font, ink, new RectangleF(x + 10, y + 7, width - 20, height - 10));
    }
    protected override void Dispose(bool disposing) { if (disposing) _timer.Dispose(); base.Dispose(disposing); }
    [StructLayout(LayoutKind.Sequential)] private struct NativeRect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct NativePoint { public int X, Y; }
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out NativePoint point);
    [DllImport("user32.dll")] private static extern nint WindowFromPoint(NativePoint point);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] private static extern nint SetWindowLongPtr(nint window, int index, nint value);
    [DllImport("user32.dll")] private static extern nint GetAncestor(nint window, uint flags);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint window);
    [DllImport("user32.dll")] private static extern bool IsIconic(nint window);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint window, out NativeRect rect);
}

using System.Runtime.InteropServices;

namespace IvanEge.WorkbookHelper;

// Observe only the scoped office window. Do not inject input, capture keys or
// move focus: native writes/exports wait until a selection/menu gesture ends.
internal sealed class NativeWorkbookInteraction(bool hidden)
{
    private nint _window;
    private long _lastGesture = long.MinValue;
    private bool _deferred;
    internal void SetWindow(long window) => _window = (nint)window;
    internal bool Ended { get; private set; }
    internal long Activity { get; private set; }
    internal bool Busy()
    {
        Ended = false; Activity = 0;
        if (hidden || _window == 0) return false;
        bool foreground = GetAncestor(GetForegroundWindow(), 3) == GetAncestor(_window, 3);
        if (foreground)
        {
            var input = new LastInput { Size = (uint)Marshal.SizeOf<LastInput>() };
            if (GetLastInputInfo(ref input)) Activity = input.Time;
        }
        var gui = new GuiThread { Size = (uint)Marshal.SizeOf<GuiThread>() };
        uint thread = GetWindowThreadProcessId(_window, out _);
        bool menu = thread != 0 && GetGUIThreadInfo(thread, ref gui) && (gui.Flags & 0x1e) != 0;
        bool held = foreground && new[] { 1, 2, 4, 0x10, 0x11 }.Any(key => (GetAsyncKeyState(key) & 0x8000) != 0);
        long now = Environment.TickCount64;
        if (menu || held) _lastGesture = now;
        bool busy = menu || held || (_lastGesture != long.MinValue && now - _lastGesture < 180);
        if (busy) _deferred = true;
        else if (_deferred) { _deferred = false; Ended = true; }
        return busy;
    }
    [StructLayout(LayoutKind.Sequential)] private struct LastInput { public uint Size, Time; }
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct GuiThread
    { public uint Size, Flags; public nint Active, Focus, Capture, MenuOwner, MoveSize, Caret; public Rect CaretRect; }
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern nint GetAncestor(nint window, uint flags);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] private static extern bool GetLastInputInfo(ref LastInput input);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint process);
    [DllImport("user32.dll")] private static extern bool GetGUIThreadInfo(uint thread, ref GuiThread info);
}

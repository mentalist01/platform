using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

namespace IvanEge.WorkbookHelper;

// Discover event identifiers from the installed Excel type library. No Office
// interop package/version dependency and no macros are injected into the book.
internal sealed class LiveExcelChanges : IDisposable
{
    private readonly object _application;
    private readonly List<(Guid Source, int Id, Delegate Handler)> _hooks = [];
    private long _serial;
    private long _full;
    private readonly List<(long Serial, string Sheet, string Address)> _cells = [];
    public long Serial => Interlocked.Read(ref _serial);
    public IEnumerable<(string Sheet, string Address)>? CellsSince(long serial)
    {
        if (serial < _full) return null;
        var cells = _cells.Where(cell => cell.Serial > serial).Select(cell => (cell.Sheet, cell.Address)).Distinct().Take(65).ToArray();
        return cells.Length <= 64 ? cells : null;
    }
    private void Changed(object sheet, object target)
    {
        long serial = Interlocked.Increment(ref _serial);
        try
        {
            dynamic range = target; dynamic rows = range.Rows, columns = range.Columns;
            int row, column, height, width;
            try { row = (int)range.Row; column = (int)range.Column; height = (int)rows.Count; width = (int)columns.Count; }
            finally { if (Marshal.IsComObject(rows)) Marshal.ReleaseComObject(rows); if (Marshal.IsComObject(columns)) Marshal.ReleaseComObject(columns); }
            if ((long)height * width > 64 || _cells.Count > 128) { _cells.Clear(); _full = serial; return; }
            string name = ((dynamic)sheet).Name;
            for (int r = row; r < row + height; r++) for (int c = column; c < column + width; c++)
            {
                string letters = ""; for (int n = c; n > 0; n = (n - 1) / 26) letters = (char)('A' + (n - 1) % 26) + letters;
                _cells.Add((serial, name, letters + r));
            }
        }
        catch { _full = serial; }
    }
    public bool Watching => _hooks.Count > 0;
    public LiveExcelChanges(object application)
    {
        _application = application;
        ITypeInfo? info = null; ITypeLib? library = null;
        try
        {
            ((IDispatchInfo)application).GetTypeInfo(0, 0, out info);
            info.GetContainingTypeLib(out library, out _);
            for (int index = 0; index < library.GetTypeInfoCount(); index++)
            {
                library.GetDocumentation(index, out string name, out _, out _, out _);
                if (name is not "AppEvents" and not "_AppEvents") continue;
                library.GetTypeInfo(index, out var source);
                try
                {
                    source.GetTypeAttr(out var pointer);
                    TYPEATTR attributes; try { attributes = Marshal.PtrToStructure<TYPEATTR>(pointer); } finally { source.ReleaseTypeAttr(pointer); }
                    for (int function = 0; function < attributes.cFuncs; function++)
                    {
                        source.GetFuncDesc(function, out var description);
                        FUNCDESC method; try { method = Marshal.PtrToStructure<FUNCDESC>(description); } finally { source.ReleaseFuncDesc(description); }
                        source.GetDocumentation(method.memid, out string eventName, out _, out _, out _);
                        if (eventName is not "SheetChange" and not "WorkbookNewSheet") continue;
                        Delegate changed = eventName == "SheetChange" ? new Action<object, object>(Changed) : new Action<object>(_ => _full = Interlocked.Increment(ref _serial));
                        ComEventsHelper.Combine(application, attributes.guid, method.memid, changed);
                        _hooks.Add((attributes.guid, method.memid, changed));
                    }
                }
                finally { Marshal.ReleaseComObject(source); }
                break;
            }
        }
        catch (Exception error) { AppLog.Error("Excel change events unavailable; using bounded snapshot polling", error); }
        finally { if (library is not null) Marshal.ReleaseComObject(library); if (info is not null) Marshal.ReleaseComObject(info); }
    }
    public void Dispose()
    {
        foreach (var hook in _hooks) try { ComEventsHelper.Remove(_application, hook.Source, hook.Id, hook.Handler); } catch { }
        _hooks.Clear();
    }
    [ComImport, Guid("00020400-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IDispatchInfo
    {
        void GetTypeInfoCount(out uint count);
        void GetTypeInfo(uint index, uint locale, out ITypeInfo info);
    }
}

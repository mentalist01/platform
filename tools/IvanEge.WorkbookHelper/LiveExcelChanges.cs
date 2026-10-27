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
    public long Serial => Interlocked.Read(ref _serial);
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
                        Action<object, object> changed = (_, _) => Interlocked.Increment(ref _serial);
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

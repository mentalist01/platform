namespace IvanEge.WorkbookHelper;

internal enum HelperUpdateLaunchAction { Continue, Wait, Check, Apply }

// Keep the unopened protocol request in the tray queue until its update check
// finishes. An already staged update takes priority even when that queue is
// nonempty; the updater carries the requests to the new process.
internal sealed class HelperUpdateLaunchGate
{
    private bool _checked, _waiting;

    public HelperUpdateLaunchAction Next(bool automatic, bool manual, bool safe, bool busy,
        bool hasWorkbookRequest, bool checking, bool pending, bool applyAllowed)
    {
        if (busy) return HelperUpdateLaunchAction.Wait;
        if (safe && pending && (automatic || manual) && applyAllowed) return HelperUpdateLaunchAction.Apply;
        if (!automatic || !safe || !hasWorkbookRequest) return HelperUpdateLaunchAction.Continue;
        if (_waiting)
        {
            if (checking) return HelperUpdateLaunchAction.Wait;
            _waiting = false;
        }
        if (_checked) return HelperUpdateLaunchAction.Continue;
        _checked = _waiting = true;
        return checking ? HelperUpdateLaunchAction.Wait : HelperUpdateLaunchAction.Check;
    }

    public void RequestStarted() { _checked = _waiting = false; }
}

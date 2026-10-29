namespace IvanEge.WorkbookHelper;

internal static class OfficeBusyErrors
{
    // Excel can reject COM calls while accepting input, filling a range or
    // recalculating. Retrying must not label its workbook as closed.
    internal static bool IsTemporary(Exception error) => error.HResult is
        unchecked((int)0x800AC472) or unchecked((int)0x80010001) or unchecked((int)0x8001010A)
        || error.InnerException is not null && IsTemporary(error.InnerException);
}

namespace IvanEge.WorkbookHelper;

// A limit of the live cell model is not a failure to save a workbook file.
internal sealed class LiveWorkbookCapacityException(string message) : FormatException(message);

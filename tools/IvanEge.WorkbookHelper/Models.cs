using System.Net;

namespace IvanEge.WorkbookHelper;

internal sealed record ProtocolRequest(Uri Origin, string Ticket);

internal sealed record WorkbookGrant(
    Uri Origin,
    string Token,
    string WorkbookKey,
    string FileName,
    string Revision,
    string ContentHash,
    DateTimeOffset? ExpiresAt,
    bool RequiresName = false,
    string? SolutionName = null,
    string? SourceTextFileName = null,
    string? SourceTextContentHash = null);

internal sealed record DownloadReceipt(
    string LocalContentHash,
    string ServerContentHash,
    string Revision,
    long SizeBytes);

internal sealed record UploadReceipt(
    string Revision,
    string ContentHash,
    string? SolutionName = null,
    string? FileName = null);

internal enum WorkbookStatusKind
{
    Watching,
    Paused,
    Reading,
    Uploading,
    Saved,
    Warning,
    Error
}

internal sealed record WorkbookStatus(WorkbookStatusKind Kind, string Message, bool Notify = false);

internal sealed class HelperApiException : Exception
{
    public HelperApiException(
        string message,
        HttpStatusCode? statusCode = null,
        bool isTransient = false,
        TimeSpan? retryAfter = null,
        Exception? innerException = null)
        : base(message, innerException)
    {
        StatusCode = statusCode;
        IsTransient = isTransient;
        RetryAfter = retryAfter;
    }

    public HttpStatusCode? StatusCode { get; }
    public bool IsTransient { get; }
    public TimeSpan? RetryAfter { get; }
}

namespace IvanEge.WorkbookHelper;

// Startup is allowed to overlap the user's first click, filter menu or typing.
// A temporary native UI lock must not terminate the only synchronization worker.
internal static class NativeReadyRetry
{
    internal static async Task<T> RunAsync<T>(Func<Task<T>> operation, Action waiting, CancellationToken token)
    {
        bool notified = false;
        while (true)
        {
            token.ThrowIfCancellationRequested();
            try { return await operation(); }
            catch (LiveOfficeBusyException)
            {
                if (!notified) { waiting(); notified = true; }
                await Task.Delay(250, token);
            }
        }
    }
}

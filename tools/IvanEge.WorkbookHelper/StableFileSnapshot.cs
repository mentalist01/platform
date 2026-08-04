using System.Buffers;
using System.Security.Cryptography;

namespace IvanEge.WorkbookHelper;

internal sealed class StableFileSnapshot : IDisposable
{
    private bool _disposed;

    private StableFileSnapshot(string path, string contentHash, long sizeBytes)
    {
        Path = path;
        ContentHash = contentHash;
        SizeBytes = sizeBytes;
    }

    public string Path { get; }
    public string ContentHash { get; }
    public long SizeBytes { get; }

    public static async Task<StableFileSnapshot> CaptureAsync(
        string sourcePath,
        TimeSpan timeout,
        CancellationToken cancellationToken,
        string? temporaryDirectory = null)
    {
        var snapshotDirectory = temporaryDirectory;
        if (string.IsNullOrWhiteSpace(snapshotDirectory))
        {
            AppPaths.EnsureDataDirectories();
            snapshotDirectory = AppPaths.TempDirectory;
        }
        else
        {
            Directory.CreateDirectory(snapshotDirectory);
        }
        var deadline = DateTime.UtcNow + timeout;
        Exception? lastError = null;

        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            string? temporaryPath = null;
            try
            {
                var first = ReadStamp(sourcePath);
                if (first.SizeBytes > AppPaths.MaxWorkbookBytes)
                {
                    throw new HelperApiException("Файл больше допустимых 64 МБ.");
                }
                await Task.Delay(650, cancellationToken).ConfigureAwait(false);
                var second = ReadStamp(sourcePath);
                if (first != second) continue;

                temporaryPath = System.IO.Path.Combine(snapshotDirectory, $"snapshot-{Guid.NewGuid():N}.tmp");
                var copied = await CopyAndHashAsync(sourcePath, temporaryPath, cancellationToken).ConfigureAwait(false);
                var after = ReadStamp(sourcePath);
                if (second != after)
                {
                    TryDelete(temporaryPath);
                    continue;
                }
                return new StableFileSnapshot(temporaryPath, copied.ContentHash, copied.SizeBytes);
            }
            catch (HelperApiException)
            {
                TryDelete(temporaryPath);
                throw;
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or FileNotFoundException)
            {
                lastError = error;
                TryDelete(temporaryPath);
                await Task.Delay(450, cancellationToken).ConfigureAwait(false);
            }
        }

        throw new HelperApiException(
            "Таблица пока занята Excel или LibreOffice. Помощник попробует снова после следующего сохранения.",
            isTransient: true,
            innerException: lastError);
    }

    private static FileStamp ReadStamp(string path)
    {
        var info = new FileInfo(path);
        info.Refresh();
        if (!info.Exists) throw new FileNotFoundException("Рабочая таблица не найдена.", path);
        return new FileStamp(info.Length, info.LastWriteTimeUtc.Ticks);
    }

    private static async Task<SnapshotCopyReceipt> CopyAndHashAsync(
        string sourcePath,
        string destinationPath,
        CancellationToken cancellationToken)
    {
        await using var source = new FileStream(
            sourcePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.ReadWrite | FileShare.Delete,
            128 * 1024,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        await using var destination = new FileStream(
            destinationPath,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            128 * 1024,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = ArrayPool<byte>.Shared.Rent(128 * 1024);
        long total = 0;
        try
        {
            while (true)
            {
                var read = await source.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken).ConfigureAwait(false);
                if (read == 0) break;
                total += read;
                if (total > AppPaths.MaxWorkbookBytes)
                {
                    throw new HelperApiException("Файл больше допустимых 64 МБ.");
                }
                hash.AppendData(buffer, 0, read);
                await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken).ConfigureAwait(false);
            }
            await destination.FlushAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
        return new SnapshotCopyReceipt(Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant(), total);
    }

    private static void TryDelete(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return;
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch
        {
            // Best effort cleanup.
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        TryDelete(Path);
    }

    private readonly record struct FileStamp(long SizeBytes, long LastWriteTicks);
    private readonly record struct SnapshotCopyReceipt(string ContentHash, long SizeBytes);
}

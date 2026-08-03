using System.Buffers;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace IvanEge.WorkbookHelper;

internal sealed class HelperApiClient : IDisposable
{
    private const string ExchangePath = "/workbook-helper/v1/exchange";
    private const string ContentPath = "/workbook-helper/v1/content";
    private readonly HttpClient _client;
    private readonly Uri _origin;

    public HelperApiClient(Uri origin)
    {
        _origin = origin;
        var handler = new HttpClientHandler
        {
            AllowAutoRedirect = false,
            AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate
        };
        _client = new HttpClient(handler)
        {
            Timeout = Timeout.InfiniteTimeSpan
        };
        _client.DefaultRequestHeaders.UserAgent.ParseAdd("IvanEgeWorkbookHelper/1.0");
        _client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    }

    public async Task<WorkbookGrant> ExchangeAsync(string ticket, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, BuildUri(ExchangePath))
        {
            Content = new StringContent(JsonSerializer.Serialize(new { ticket }), Encoding.UTF8, "application/json")
        };
        using var response = await SendAsync(request, HttpCompletionOption.ResponseContentRead, TimeSpan.FromSeconds(30), cancellationToken)
            .ConfigureAwait(false);
        await EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
        return ParseExchangeResponse(_origin, document.RootElement);
    }

    internal static WorkbookGrant ParseExchangeResponse(Uri origin, JsonElement root)
    {
        var workbook = TryGetObject(root, "workbook", out var nested) ? nested : root;
        var token = ReadString(root, "token");
        var workbookKey = ReadString(workbook, "workbookKey", "key") ?? ReadString(root, "workbookKey");
        var fileName = ReadString(workbook, "fileName", "suggestedName", "name") ?? ReadString(root, "fileName");
        var revision = ReadString(workbook, "revision") ?? ReadString(root, "revision") ?? string.Empty;
        var contentHash = NormalizeHash(ReadString(workbook, "contentHash", "sha256") ?? ReadString(root, "contentHash"))
            ?? string.Empty;
        var expiresText = ReadString(root, "expiresAt") ?? ReadString(workbook, "expiresAt");
        var requiresName = ReadBoolean(workbook, "requiresName", "nameRequired")
            ?? ReadBoolean(root, "requiresName", "nameRequired")
            ?? false;
        var solutionName = ReadString(workbook, "solutionName") ?? ReadString(root, "solutionName");

        if (string.IsNullOrWhiteSpace(token) || token.Length > 4096
            || string.IsNullOrWhiteSpace(workbookKey) || workbookKey.Length > 512
            || string.IsNullOrWhiteSpace(fileName) || fileName.Length > 240)
        {
            throw new HelperApiException("Сервер вернул неполные данные для открытия таблицы.");
        }
        DateTimeOffset? expiresAt = null;
        if (!string.IsNullOrWhiteSpace(expiresText) && DateTimeOffset.TryParse(expiresText, out var parsedExpiry))
        {
            expiresAt = parsedExpiry;
        }
        return new WorkbookGrant(
            origin,
            token,
            workbookKey,
            fileName,
            revision,
            contentHash,
            expiresAt,
            requiresName,
            solutionName);
    }

    public async Task<DownloadReceipt> DownloadAsync(WorkbookGrant grant, string destinationPath, CancellationToken cancellationToken)
    {
        using var request = CreateAuthorizedRequest(HttpMethod.Get, grant);
        using var response = await SendAsync(request, HttpCompletionOption.ResponseHeadersRead, TimeSpan.FromMinutes(2), cancellationToken)
            .ConfigureAwait(false);
        await EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
        if (response.Content.Headers.ContentLength is > AppPaths.MaxWorkbookBytes)
        {
            throw new HelperApiException("Файл больше допустимых 64 МБ.", HttpStatusCode.RequestEntityTooLarge);
        }

        var responseRevision = ReadHeader(response, "X-Workbook-Revision") ?? grant.Revision;
        var responseContentHash = NormalizeHash(ReadHeader(response, "X-Workbook-Content-Hash")) ?? string.Empty;

        Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);
        await using var source = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
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
                    throw new HelperApiException("Файл больше допустимых 64 МБ.", HttpStatusCode.RequestEntityTooLarge);
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
        var localContentHash = Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
        return new DownloadReceipt(
            localContentHash,
            string.IsNullOrWhiteSpace(responseContentHash) ? localContentHash : responseContentHash,
            responseRevision,
            total);
    }

    public async Task<UploadReceipt> UploadAsync(
        WorkbookGrant grant,
        string snapshotPath,
        string contentHash,
        string revision,
        string? solutionName,
        CancellationToken cancellationToken)
    {
        var safeRevision = revision ?? string.Empty;
        string? safeSolutionName = null;
        if (!string.IsNullOrWhiteSpace(solutionName))
        {
            if (!SolutionNameRules.TryNormalize(solutionName, out var normalizedSolutionName, out var nameError))
            {
                throw new FormatException(nameError);
            }
            safeSolutionName = normalizedSolutionName;
        }
        using var request = CreateAuthorizedRequest(HttpMethod.Put, grant);
        request.Headers.TryAddWithoutValidation("X-Content-SHA256", contentHash);
        if (!string.IsNullOrWhiteSpace(safeRevision)) request.Headers.TryAddWithoutValidation("X-Workbook-Revision", safeRevision);

        await using var fileStream = new FileStream(
            snapshotPath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            128 * 1024,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        using var multipart = new MultipartFormDataContent($"----IvanEge{Guid.NewGuid():N}");
        using var fileContent = new StreamContent(fileStream, 128 * 1024);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        multipart.Add(fileContent, "file", LocalWorkbookFiles.SanitizeFileName(grant.FileName));
        multipart.Add(new StringContent(safeRevision, Encoding.UTF8), "revision");
        multipart.Add(new StringContent(contentHash, Encoding.UTF8), "contentHash");
        if (!string.IsNullOrWhiteSpace(safeSolutionName))
        {
            multipart.Add(new StringContent(safeSolutionName, Encoding.UTF8), "solutionName");
        }
        request.Content = multipart;

        using var response = await SendAsync(request, HttpCompletionOption.ResponseContentRead, TimeSpan.FromMinutes(2), cancellationToken)
            .ConfigureAwait(false);
        await EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);
        if (response.Content.Headers.ContentLength == 0)
        {
            return new UploadReceipt(safeRevision, contentHash, safeSolutionName);
        }

        try
        {
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
            return ParseUploadResponse(document.RootElement, safeRevision, contentHash, safeSolutionName);
        }
        catch (JsonException)
        {
            return new UploadReceipt(safeRevision, contentHash, safeSolutionName);
        }
    }

    internal static UploadReceipt ParseUploadResponse(
        JsonElement root,
        string fallbackRevision,
        string fallbackContentHash,
        string? fallbackSolutionName)
    {
        var hasFile = TryGetObject(root, "file", out var file);
        var nextRevision = ReadString(root, "revision") ?? fallbackRevision;
        var nextHash = NormalizeHash(ReadString(root, "contentHash", "sha256")) ?? fallbackContentHash;
        var nextSolutionName = ReadString(root, "solutionName")
            ?? (hasFile ? ReadString(file, "solutionName") : null)
            ?? fallbackSolutionName;
        var nextFileName = hasFile
            ? ReadString(file, "name", "fileName")
            : ReadString(root, "name", "fileName");
        return new UploadReceipt(nextRevision, nextHash, nextSolutionName, nextFileName);
    }

    private HttpRequestMessage CreateAuthorizedRequest(HttpMethod method, WorkbookGrant grant)
    {
        var request = new HttpRequestMessage(method, BuildUri(ContentPath));
        request.Headers.Authorization = new AuthenticationHeaderValue("Workbook", grant.Token);
        request.Headers.TryAddWithoutValidation("X-Workbook-Key", grant.WorkbookKey);
        return request;
    }

    private Uri BuildUri(string path) => new(_origin, path);

    private async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        HttpCompletionOption completionOption,
        TimeSpan timeout,
        CancellationToken cancellationToken)
    {
        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeout);
        try
        {
            return await _client.SendAsync(request, completionOption, timeoutSource.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException error) when (!cancellationToken.IsCancellationRequested)
        {
            throw new HelperApiException("Сервер слишком долго не отвечает.", isTransient: true, innerException: error);
        }
        catch (HttpRequestException error)
        {
            throw new HelperApiException("Нет соединения с платформой.", isTransient: true, innerException: error);
        }
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode) return;
        var status = response.StatusCode;
        var retryAfter = response.Headers.RetryAfter?.Delta;
        if (retryAfter is null && response.Headers.RetryAfter?.Date is { } retryDate)
        {
            var untilRetry = retryDate - DateTimeOffset.UtcNow;
            if (untilRetry > TimeSpan.Zero) retryAfter = untilRetry;
        }
        var transient = status == HttpStatusCode.RequestTimeout
            || (int)status == 425
            || (int)status == 429
            || (int)status >= 500;
        var detail = string.Empty;
        var jsonDetail = string.Empty;
        try
        {
            detail = (await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false)).Trim();
            if (detail.Length > 400) detail = detail[..400];
            if (detail.StartsWith('{'))
            {
                using var document = JsonDocument.Parse(detail);
                jsonDetail = ReadString(document.RootElement, "error", "message") ?? string.Empty;
                if (jsonDetail.Length > 400) jsonDetail = jsonDetail[..400];
                if (!string.IsNullOrWhiteSpace(jsonDetail)) detail = jsonDetail;
            }
        }
        catch
        {
            // Keep a generic status message.
        }
        var message = ResolveErrorMessage(status, detail, jsonDetail);
        throw new HelperApiException(message, status, transient, retryAfter);
    }

    internal static string ResolveErrorMessage(HttpStatusCode status, string detail, string jsonDetail) =>
        status switch
        {
            HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden or HttpStatusCode.Gone =>
                "Срок доступа к таблице истёк. Нажмите «Решать» на платформе ещё раз.",
            HttpStatusCode.RequestEntityTooLarge => "Файл больше допустимых 64 МБ.",
            HttpStatusCode.NotFound => "Платформа больше не видит эту рабочую таблицу.",
            HttpStatusCode.Conflict when !string.IsNullOrWhiteSpace(jsonDetail) => jsonDetail,
            HttpStatusCode.Conflict => "На сервере появилась более новая версия таблицы. Запустите её с платформы ещё раз.",
            _ when !string.IsNullOrWhiteSpace(detail) => detail,
            _ => $"Сервер вернул ошибку {(int)status}."
        };

    internal static string? NormalizeHash(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized.Length == 64 && normalized.All(Uri.IsHexDigit) ? normalized : null;
    }

    private static bool TryGetObject(JsonElement element, string name, out JsonElement value)
    {
        if (TryGetProperty(element, name, out value) && value.ValueKind == JsonValueKind.Object) return true;
        value = default;
        return false;
    }

    private static string? ReadHeader(HttpResponseMessage response, string name)
    {
        return response.Headers.TryGetValues(name, out var values)
            ? values.FirstOrDefault()?.Trim()
            : null;
    }

    private static string? ReadString(JsonElement element, params string[] names)
    {
        foreach (var name in names)
        {
            if (!TryGetProperty(element, name, out var value)) continue;
            if (value.ValueKind == JsonValueKind.String) return value.GetString()?.Trim();
            if (value.ValueKind is JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False) return value.ToString();
        }
        return null;
    }

    private static bool? ReadBoolean(JsonElement element, params string[] names)
    {
        foreach (var name in names)
        {
            if (!TryGetProperty(element, name, out var value)) continue;
            if (value.ValueKind == JsonValueKind.True) return true;
            if (value.ValueKind == JsonValueKind.False) return false;
            if (value.ValueKind == JsonValueKind.String && bool.TryParse(value.GetString(), out var parsed))
            {
                return parsed;
            }
        }
        return null;
    }

    private static bool TryGetProperty(JsonElement element, string name, out JsonElement value)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    value = property.Value;
                    return true;
                }
            }
        }
        value = default;
        return false;
    }

    public void Dispose() => _client.Dispose();
}

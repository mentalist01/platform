namespace IvanEge.WorkbookHelper;

internal static class ProtocolRequestParser
{
    private const int MaxUriLength = 4096;
    private const int MaxTicketLength = 512;

    public static ProtocolRequest Parse(string? rawValue)
    {
        var raw = (rawValue ?? string.Empty).Trim().Trim('"');
        if (raw.Length == 0 || raw.Length > MaxUriLength)
        {
            throw new FormatException("Некорректная ссылка запуска помощника.");
        }
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri)
            || !string.Equals(uri.Scheme, "ivan-ege", StringComparison.OrdinalIgnoreCase))
        {
            throw new FormatException("Ссылка предназначена не для помощника «Иван на сотку».");
        }

        var host = uri.Host.Trim('/');
        var path = uri.AbsolutePath.Trim('/');
        var isOpenAction = (string.Equals(host, "open", StringComparison.OrdinalIgnoreCase) && path.Length == 0)
            || (string.Equals(host, "workbook", StringComparison.OrdinalIgnoreCase)
                && string.Equals(path, "open", StringComparison.OrdinalIgnoreCase));
        if (!isOpenAction)
        {
            throw new FormatException("Неизвестная команда помощника.");
        }

        var query = ParseQuery(uri.Query);
        if (!query.TryGetValue("origin", out var originValue)
            || !query.TryGetValue("ticket", out var ticketValue))
        {
            throw new FormatException("В ссылке не хватает адреса платформы или одноразового билета.");
        }

        var ticket = ticketValue.Trim();
        if (ticket.Length < 16 || ticket.Length > MaxTicketLength
            || ticket.Any(character => !(char.IsAsciiLetterOrDigit(character) || "-_.~".Contains(character))))
        {
            throw new FormatException("Некорректный одноразовый билет запуска.");
        }

        var origin = NormalizeAndValidateOrigin(originValue);
        return new ProtocolRequest(origin, ticket);
    }

    public static Uri NormalizeAndValidateOrigin(string value)
    {
        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var origin)
            || (!string.Equals(origin.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(origin.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)))
        {
            throw new FormatException("Платформа передала некорректный адрес сервера.");
        }
        if (!string.IsNullOrEmpty(origin.UserInfo)
            || !string.IsNullOrEmpty(origin.Query)
            || !string.IsNullOrEmpty(origin.Fragment)
            || (origin.AbsolutePath != "/" && origin.AbsolutePath.Length != 0))
        {
            throw new FormatException("Адрес платформы должен содержать только протокол, домен и порт.");
        }
        if (string.Equals(origin.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) && !origin.IsLoopback)
        {
            throw new FormatException("Незашифрованное подключение разрешено только к localhost для разработки.");
        }

        var builder = new UriBuilder(origin.Scheme.ToLowerInvariant(), origin.IdnHost.ToLowerInvariant(), origin.IsDefaultPort ? -1 : origin.Port)
        {
            Path = string.Empty,
            Query = string.Empty,
            Fragment = string.Empty,
            UserName = string.Empty,
            Password = string.Empty
        };
        return builder.Uri;
    }

    private static Dictionary<string, string> ParseQuery(string query)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var source = query.TrimStart('?');
        if (source.Length == 0) return result;

        foreach (var pair in source.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = pair.IndexOf('=');
            var encodedKey = separator >= 0 ? pair[..separator] : pair;
            var encodedValue = separator >= 0 ? pair[(separator + 1)..] : string.Empty;
            string key;
            string value;
            try
            {
                key = Uri.UnescapeDataString(encodedKey.Replace('+', ' '));
                value = Uri.UnescapeDataString(encodedValue.Replace('+', ' '));
            }
            catch (UriFormatException error)
            {
                throw new FormatException("Некорректная кодировка ссылки запуска.", error);
            }
            if (!result.TryAdd(key, value))
            {
                throw new FormatException("Ссылка запуска содержит повторяющиеся параметры.");
            }
        }
        return result;
    }
}

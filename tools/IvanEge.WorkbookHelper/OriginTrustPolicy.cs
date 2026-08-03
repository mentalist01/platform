namespace IvanEge.WorkbookHelper;

internal static class OriginTrustPolicy
{
    public static bool IsBuiltInTrusted(Uri origin)
    {
        if (origin.IsLoopback) return true;
        return string.Equals(origin.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            && string.Equals(origin.IdnHost, "ivan100.ru", StringComparison.OrdinalIgnoreCase)
            && origin.IsDefaultPort;
    }
}

using System.Text.Json;

namespace IvanEge.WorkbookHelper;

internal sealed class OriginTrustStore
{
    private readonly string _path;
    private readonly object _gate = new();
    private HashSet<string>? _origins;

    public OriginTrustStore(string? path = null)
    {
        _path = path ?? AppPaths.TrustedOriginsPath;
    }

    public bool IsTrusted(Uri origin)
    {
        lock (_gate)
        {
            EnsureLoaded();
            return _origins!.Contains(ToKey(origin));
        }
    }

    public void Trust(Uri origin)
    {
        lock (_gate)
        {
            EnsureLoaded();
            if (_origins!.Add(ToKey(origin))) Save();
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            _origins = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            Save();
        }
    }

    private void EnsureLoaded()
    {
        if (_origins is not null) return;
        _origins = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            if (!File.Exists(_path)) return;
            var values = JsonSerializer.Deserialize<string[]>(File.ReadAllText(_path)) ?? [];
            foreach (var value in values)
            {
                try
                {
                    _origins.Add(ToKey(ProtocolRequestParser.NormalizeAndValidateOrigin(value)));
                }
                catch
                {
                    // Ignore stale or manually corrupted entries.
                }
            }
        }
        catch
        {
            // A corrupt trust file behaves like an empty trust store.
        }
    }

    private void Save()
    {
        var directory = Path.GetDirectoryName(_path)!;
        Directory.CreateDirectory(directory);
        var temporaryPath = _path + $".{Guid.NewGuid():N}.tmp";
        File.WriteAllText(temporaryPath, JsonSerializer.Serialize(_origins!.OrderBy(value => value)));
        File.Move(temporaryPath, _path, true);
    }

    private static string ToKey(Uri origin) => origin.GetLeftPart(UriPartial.Authority).TrimEnd('/');
}

using System.IO.Compression;
using System.Text;
using System.Xml;

namespace IvanEge.WorkbookHelper;

// Package flat ODF without recalculating cells or loading the whole sheet into
// memory. The user's open file stays untouched; only the upload copy is zipped.
internal static class FlatWorkbookPackage
{
    private const string Office = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
    private const string Manifest = "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0";
    public const string Mime = "application/vnd.oasis.opendocument.spreadsheet";
    private static readonly HashSet<string> Sections = new(StringComparer.Ordinal)
        { "meta", "settings", "scripts", "font-face-decls", "styles", "automatic-styles", "master-styles", "body" };
    private static readonly (string File, string Root, string[] Sections)[] Parts =
    [
        ("content.xml", "document-content", ["scripts", "font-face-decls", "automatic-styles", "body"]),
        ("styles.xml", "document-styles", ["font-face-decls", "styles", "automatic-styles", "master-styles"]),
        ("meta.xml", "document-meta", ["meta"]),
        ("settings.xml", "document-settings", ["settings"])
    ];

    public static void Create(string sourcePath, string destinationPath, CancellationToken cancellationToken)
    {
        using var destination = new FileStream(destinationPath, FileMode.CreateNew, FileAccess.Write);
        using var zip = new ZipArchive(destination, ZipArchiveMode.Create);
        var documentVersion = "1.3";
        using (var stream = zip.CreateEntry("mimetype", CompressionLevel.NoCompression).Open())
            stream.Write(Encoding.ASCII.GetBytes(Mime));
        foreach (var part in Parts)
        {
            cancellationToken.ThrowIfCancellationRequested();
            using var reader = XmlReader.Create(sourcePath, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null });
            reader.MoveToContent();
            if (reader.LocalName != "document" || reader.NamespaceURI != Office || reader.GetAttribute("mimetype", Office) != Mime)
                throw new HelperApiException("Не удалось сжать таблицу. Сохраните её в LibreOffice как .ods; исходник сохранён.");
            var version = reader.GetAttribute("version", Office) ?? "1.3";
            documentVersion = version;
            using var stream = zip.CreateEntry(part.File, CompressionLevel.Optimal).Open();
            using var writer = XmlWriter.Create(stream, new XmlWriterSettings { Encoding = new UTF8Encoding(false), CloseOutput = false });
            writer.WriteStartDocument(); writer.WriteStartElement("office", part.Root, Office);
            if (reader.MoveToFirstAttribute())
            {
                do
                {
                    if (reader.Prefix == "xmlns") writer.WriteAttributeString("xmlns", reader.LocalName, null, reader.Value);
                    else if (reader.Name == "xmlns") writer.WriteAttributeString("xmlns", reader.Value);
                } while (reader.MoveToNextAttribute());
                reader.MoveToElement();
            }
            writer.WriteAttributeString("office", "version", Office, version);
            reader.ReadStartElement();
            while (reader.MoveToContent() == XmlNodeType.Element)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (reader.NamespaceURI != Office || !Sections.Contains(reader.LocalName))
                    throw new HelperApiException("В таблице есть неизвестный раздел. Сохраните копию как .ods в LibreOffice; исходник сохранён.");
                if (part.Sections.Contains(reader.LocalName)) writer.WriteNode(reader, false);
                else reader.Skip();
            }
            writer.WriteEndElement(); writer.WriteEndDocument();
        }
        using var manifestStream = zip.CreateEntry("META-INF/manifest.xml", CompressionLevel.Optimal).Open();
        using var manifest = XmlWriter.Create(manifestStream, new XmlWriterSettings { Encoding = new UTF8Encoding(false) });
        manifest.WriteStartDocument(); manifest.WriteStartElement("manifest", "manifest", Manifest);
        manifest.WriteAttributeString("manifest", "version", Manifest, documentVersion);
        foreach (var (name, mime) in new[] { ("/", Mime) }.Concat(Parts.Select(p => (p.File, "text/xml"))))
        {
            manifest.WriteStartElement("manifest", "file-entry", Manifest);
            manifest.WriteAttributeString("manifest", "full-path", Manifest, name);
            manifest.WriteAttributeString("manifest", "media-type", Manifest, mime);
            manifest.WriteEndElement();
        }
        manifest.WriteEndElement(); manifest.WriteEndDocument();
    }
}

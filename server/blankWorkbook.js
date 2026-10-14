import { deflateRawSync } from 'node:zlib';
const mime = 'application/vnd.oasis.opendocument.spreadsheet';
const office = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0';
const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="${office}" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.3"><office:body><office:spreadsheet><table:table table:name="Лист1"><table:table-row><table:table-cell office:value-type="string"><text:p/></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`;
const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>`;
const crc32 = bytes => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
export function blankWorkbook() {
  const local = [], central = []; let offset = 0;
  for (const [name, text, method] of [['mimetype', mime, 0], ['content.xml', content, 8], ['META-INF/manifest.xml', manifest, 8]]) {
    const filename = Buffer.from(name), raw = Buffer.from(text), bytes = method ? deflateRawSync(raw) : raw;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(method, 8); header.writeUInt16LE(33, 12); header.writeUInt32LE(crc32(raw), 14);
    header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(raw.length, 22); header.writeUInt16LE(filename.length, 26);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(method, 10); entry.writeUInt16LE(33, 14); entry.writeUInt32LE(crc32(raw), 16);
    entry.writeUInt32LE(bytes.length, 20); entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    local.push(header, filename, bytes); central.push(entry, filename); offset += header.length + filename.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(3, 8); end.writeUInt16LE(3, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export const BLANK_WORKBOOK_ODS = blankWorkbook();
export const workbookSolutionFormatAllowed = (source, uploaded) => source === uploaded || source === '.fods' && uploaded === '.ods';

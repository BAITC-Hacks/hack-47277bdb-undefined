const { inflateRawSync } = require('node:zlib');
const ApiError = require('../../../utils/apiError');

const MAX_ARCHIVE_BYTES = 24 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 512;

function invalidArchive() {
  return new ApiError(422, 'INVALID_DOCUMENT_ARCHIVE', 'The document archive is invalid or exceeds safe extraction limits.');
}

/** Inspect AND bounded-inflate every ZIP entry before a document library sees it.
 * Central-directory size declarations alone do not protect against ZIP bombs.
 * Nothing is extracted to disk. ZIP64, encryption and non-DEFLATE methods fail closed.
 */
function inspectOfficeArchive(buffer, extension) {
  try {
    let end = -1;
    for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
      if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) {
        end = offset;
        break;
      }
    }
    if (end < 0 || buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0) throw invalidArchive();
    const count = buffer.readUInt16LE(end + 10);
    const directorySize = buffer.readUInt32LE(end + 12);
    const directoryStart = buffer.readUInt32LE(end + 16);
    if (!count || count > MAX_ENTRIES || count !== buffer.readUInt16LE(end + 8)
      || directoryStart + directorySize !== end) throw invalidArchive();
    const names = new Set();
    const localOffsets = new Set();
    let offset = directoryStart;
    let expandedBytes = 0;
    for (let index = 0; index < count; index += 1) {
      if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) throw invalidArchive();
      const flags = buffer.readUInt16LE(offset + 8);
      const method = buffer.readUInt16LE(offset + 10);
      const compressed = buffer.readUInt32LE(offset + 20);
      const expanded = buffer.readUInt32LE(offset + 24);
      const nameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const local = buffer.readUInt32LE(offset + 42);
      const next = offset + 46 + nameLength + extraLength + commentLength;
      if (next > end || (flags & 0x41) || ![0, 8].includes(method)
        || expanded > MAX_ENTRY_BYTES || expandedBytes + expanded > MAX_ARCHIVE_BYTES
        || buffer.readUInt16LE(offset + 34) !== 0 || localOffsets.has(local)) throw invalidArchive();
      const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
      if (!name || name.includes('\u0000') || name.includes('\\') || name.startsWith('/')
        || name.split('/').some((part) => part === '..' || part === '.') || names.has(name)
        || /vbaProject\.bin$/i.test(name)) throw invalidArchive();
      if (local + 30 > directoryStart || buffer.readUInt32LE(local) !== 0x04034b50
        || buffer.readUInt16LE(local + 6) !== flags || buffer.readUInt16LE(local + 8) !== method) throw invalidArchive();
      const localNameLength = buffer.readUInt16LE(local + 26);
      const dataStart = local + 30 + localNameLength + buffer.readUInt16LE(local + 28);
      if (dataStart + compressed > directoryStart || dataStart > directoryStart
        || !buffer.subarray(local + 30, local + 30 + localNameLength)
          .equals(buffer.subarray(offset + 46, offset + 46 + nameLength))) throw invalidArchive();
      const payload = buffer.subarray(dataStart, dataStart + compressed);
      // maxOutputLength bounds actual output even when directory metadata lies.
      const bytes = method === 8 ? inflateRawSync(payload, { maxOutputLength: MAX_ENTRY_BYTES }) : payload;
      if (bytes.length !== expanded) throw invalidArchive();
      expandedBytes += bytes.length;
      names.add(name);
      localOffsets.add(local);
      offset = next;
    }
    if (offset !== end || !names.has('[Content_Types].xml')
      || !names.has(extension === 'xlsx' ? 'xl/workbook.xml' : 'word/document.xml')) throw invalidArchive();
    return { entryCount: count, expandedBytes };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalidArchive();
  }
}

module.exports = { inspectOfficeArchive, MAX_ARCHIVE_BYTES, MAX_ENTRY_BYTES, MAX_ENTRIES };

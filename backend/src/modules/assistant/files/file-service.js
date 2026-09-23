const { createHash } = require('node:crypto');
const ApiError = require('../../../utils/apiError');
const { inspectOfficeArchive } = require('./archive');
const { LIMITS, addWarning, boundedCell, textDocument, parseCsv, parseSpreadsheet } = require('./parsers');
const optionalParsers = require('./optional-parsers');

const FORMATS = Object.freeze({
  txt: { kind: 'text', mimeTypes: ['text/plain'] },
  csv: { kind: 'text', mimeTypes: ['text/csv', 'application/csv', 'text/plain'] },
  xlsx: { kind: 'spreadsheet', mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] },
  docx: { kind: 'document', mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  pdf: { kind: 'pdf', mimeTypes: ['application/pdf'] },
  jpg: { kind: 'image', mimeTypes: ['image/jpeg'] },
  jpeg: { kind: 'image', mimeTypes: ['image/jpeg'] },
  png: { kind: 'image', mimeTypes: ['image/png'] },
});

const INSTRUCTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/i,
  /disregard\s+(?:all\s+)?instructions/i,
  /(?:system|developer)\s+prompt/i,
  /(?:add|put)\s+.{0,150}\s+(?:to|in)\s+(?:the\s+)?cart/i,
  /добав[ьи]\s+.{0,150}\s+в\s+корзин/i,
  /игнорируй\s+.{0,150}инструкц/i,
  /нұсқаулықтарды\s+елеме/i,
];

function validateAssistantFile(input) {
  if (!input || typeof input.filename !== 'string' || !input.filename.trim()
    || input.filename.length > 255 || /[\\/<>:\u0000-\u001f\u007f]/.test(input.filename)) {
    throw new ApiError(422, 'INVALID_FILE_NAME', 'A file name without paths or control characters is required.');
  }
  const filename = input.filename.trim();
  const extension = filename.split('.').pop().toLowerCase();
  const format = Object.prototype.hasOwnProperty.call(FORMATS, extension) && FORMATS[extension];
  if (!format || !filename.includes('.')) {
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Use UTF-8 TXT/CSV, XLSX, DOCX, PDF, JPEG or PNG. Legacy XLS/DOC and macro-enabled documents are not supported.');
  }
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType.trim().toLowerCase() : '';
  if (!format.mimeTypes.includes(mimeType)) throw new ApiError(415, 'FILE_TYPE_MISMATCH', 'The document extension and MIME type do not match.');
  if (!(input.content instanceof Uint8Array) || input.content.byteLength === 0) {
    throw new ApiError(422, 'EMPTY_FILE', 'A nonempty Buffer or Uint8Array is required.');
  }
  if (input.content.byteLength > LIMITS.fileBytes) throw new ApiError(413, 'FILE_TOO_LARGE', 'Assistant documents must not exceed 10 MiB.');
  // A private copy prevents caller mutation while an asynchronous parser runs.
  const content = Buffer.from(input.content);
  const matches = (prefix) => content.length >= prefix.length && content.subarray(0, prefix.length).equals(Buffer.from(prefix));
  const valid = ['txt', 'csv'].includes(extension)
    || (extension === 'pdf' && /^%PDF-\d\.\d/.test(content.subarray(0, 8).toString('ascii')))
    || (['jpg', 'jpeg'].includes(extension) && matches([0xff, 0xd8, 0xff]))
    || (extension === 'png' && matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    || (['xlsx', 'docx'].includes(extension) && matches([0x50, 0x4b, 0x03, 0x04]));
  if (!valid) throw new ApiError(415, 'FILE_SIGNATURE_MISMATCH', 'The file signature does not match its declared format.');
  if (['xlsx', 'docx'].includes(extension)) inspectOfficeArchive(content, extension);
  return { filename, extension, mimeType, kind: format.kind, content };
}

function redactPaymentData(text) {
  let count = 0;
  const redact = () => { count += 1; return '[payment data redacted]'; };
  // IBAN must be redacted before its numeric suffix can match the card rule.
  let clean = text.replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g, redact);
  clean = clean.replace(/\b(?:CVV2?|CVC2?|card\s*(?:number|no\.?|security\s*code)|номер\s*карты|карта\s*нөмірі)\s*[:=#-]?\s*(?:\d[ -]?){3,19}\b/gi, redact);
  // Conservatively redact possible card numbers, not merely known card issuers.
  clean = clean.replace(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g, redact);
  return { text: clean, count };
}

function isolateDocumentText(text) {
  let ignoredInstructionCount = 0;
  const data = text.split(/\r?\n/).map((line) => {
    if (INSTRUCTION_PATTERNS.some((pattern) => pattern.test(line))) {
      ignoredInstructionCount += 1;
      return '[untrusted instruction removed]';
    }
    return line;
  }).join('\n');
  const redacted = redactPaymentData(data);
  return { text: redacted.text, ignoredInstructionCount, redactedPaymentCount: redacted.count };
}

function normalizeExtraction(extracted) {
  if (!extracted || typeof extracted.text !== 'string' || !Array.isArray(extracted.rows)
    || !Array.isArray(extracted.warnings)) throw new ApiError(502, 'INVALID_PARSER_RESULT', 'The document parser returned an invalid result.');
  const warnings = extracted.warnings.slice(0, 20).filter((warning) => typeof warning === 'string').map((warning) => warning.slice(0, 300));
  if (extracted.text.length > LIMITS.textCharacters) addWarning(warnings, 'Extracted text was truncated to 50000 characters.');
  const cleanText = isolateDocumentText(extracted.text.slice(0, LIMITS.textCharacters));
  const rows = [];
  let remaining = LIMITS.textCharacters;
  let rowInstructions = 0;
  let rowPayments = 0;
  if (extracted.rows.length > LIMITS.rows) addWarning(warnings, 'Additional rows were not extracted.');
  for (const row of extracted.rows.slice(0, LIMITS.rows)) {
    if (!row || !Array.isArray(row.cells)) continue;
    if (row.cells.length > LIMITS.columns) addWarning(warnings, 'Additional columns were not extracted.');
    const original = row.cells.slice(0, LIMITS.columns).map((cell) => boundedCell(cell, warnings));
    // Filter the structured representation too: cleaning text alone leaves a
    // bypass for future specification matching through original row cells.
    if (original.some((cell) => INSTRUCTION_PATTERNS.some((pattern) => pattern.test(cell)))) {
      rowInstructions += 1;
      continue;
    }
    const cells = original.map((cell) => {
      const result = redactPaymentData(cell);
      rowPayments += result.count;
      return result.text;
    });
    const size = cells.reduce((sum, cell) => sum + cell.length, 0);
    if (size > remaining) { addWarning(warnings, 'Additional row data exceeded the extraction text limit.'); break; }
    remaining -= size;
    rows.push({ cells,
      ...(typeof row.sheet === 'string' ? { sheet: row.sheet.slice(0, 100) } : {}),
      ...(Number.isSafeInteger(row.rowNumber) && row.rowNumber > 0 ? { rowNumber: row.rowNumber } : {}),
    });
  }
  const ignoredInstructionCount = Math.max(cleanText.ignoredInstructionCount, rowInstructions);
  const redactedPaymentCount = Math.max(cleanText.redactedPaymentCount, rowPayments);
  if (ignoredInstructionCount) addWarning(warnings, 'Instruction-like document content was omitted. Remaining content is still untrusted data.');
  if (redactedPaymentCount) addWarning(warnings, 'Possible payment data was redacted; do not upload payment credentials.');
  return { extracted: { text: cleanText.text, rows, warnings }, ignoredInstructionCount, redactedPaymentCount };
}

/** Pure, transient extraction: no server, DB, filesystem write, catalog match,
 * order/cart mutation, network call, identifier allocation or public asset URL.
 * Trusted parser hooks receive bytes and metadata; they must not follow links.
 */
async function processAssistantFile(input, options = {}) {
  const file = validateAssistantFile(input);
  let extraction;
  if (file.extension === 'txt') extraction = { text: textDocument(file.content), rows: [], warnings: [] };
  else if (file.extension === 'csv') extraction = parseCsv(textDocument(file.content), options.csvDelimiter);
  else if (file.extension === 'xlsx') extraction = await parseSpreadsheet(file.content);
  else {
    const hook = file.kind === 'document' ? (options.documentParser === undefined ? optionalParsers.parseDocx : options.documentParser)
      : file.kind === 'pdf' ? (options.pdfParser === undefined ? optionalParsers.parsePdf : options.pdfParser)
        : options.imageParser;
    if (typeof hook === 'function') extraction = await hook(file.content, { filename: file.filename, mimeType: file.mimeType });
  }
  const extractionStatus = extraction ? 'extracted' : 'not_configured';
  if (!extraction) extraction = {
    text: '', rows: [], warnings: [file.kind === 'image'
      ? 'Image signature accepted, but no OCR/vision adapter is configured. No product identification was performed.'
      : 'The optional document parser is not configured. No document text was extracted.'],
  };
  const result = normalizeExtraction(extraction);
  return {
    filename: file.filename, mimeType: file.mimeType, kind: file.kind,
    sizeBytes: file.content.length, sha256: createHash('sha256').update(file.content).digest('hex'),
    extractionStatus, untrusted: true, requiresReview: true, ...result,
  };
}

module.exports = { processAssistantFile, validateAssistantFile, isolateDocumentText, redactPaymentData, LIMITS, FORMATS };

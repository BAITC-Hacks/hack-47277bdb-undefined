const ApiError = require('../../../utils/apiError');

function optionalDependency(name) {
  try { return require(name); } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && error.message.includes(`'${name}'`)) return null;
    throw error;
  }
}

// Lazy CommonJS adapters keep the store/API usable without optional document
// dependencies. Dependencies are loaded only when this format is requested.
async function parseDocx(content) {
  const mammoth = optionalDependency('mammoth');
  if (!mammoth) return null;
  try {
    const result = await mammoth.extractRawText({ buffer: content }, { externalFileAccess: false });
    return {
      text: result.value,
      rows: [],
      warnings: result.messages.length ? ['The Word parser reported document warnings; review extracted text.'] : [],
    };
  } catch {
    throw new ApiError(422, 'INVALID_WORD_DOCUMENT', 'The Word document could not be read.');
  }
}

async function parsePdf(content) {
  const dependency = optionalDependency('pdf-parse');
  if (!dependency) return null;
  if (typeof dependency.PDFParse !== 'function') {
    throw new ApiError(503, 'DOCUMENT_PARSER_UNAVAILABLE', 'The configured PDF parser is not compatible with this adapter.');
  }
  let parser;
  try {
    parser = new dependency.PDFParse({ data: new Uint8Array(content) });
    const result = await parser.getText({ first: 10 });
    const warnings = [];
    if (result.total > 10) warnings.push('Only the first 10 PDF pages were extracted.');
    if (!result.text?.trim()) warnings.push('No selectable text was found; scanned PDFs require a future OCR adapter.');
    return { text: result.text || '', rows: [], warnings };
  } catch {
    throw new ApiError(422, 'INVALID_PDF_DOCUMENT', 'The PDF document could not be read; encrypted documents are not supported.');
  } finally {
    if (parser) await parser.destroy().catch(() => {});
  }
}

module.exports = { parseDocx, parsePdf };

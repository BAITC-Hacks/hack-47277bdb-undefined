const ExcelJS = require('exceljs');
const ApiError = require('../../../utils/apiError');

const LIMITS = Object.freeze({
  fileBytes: 10 * 1024 * 1024,
  textCharacters: 50000,
  rows: 100,
  columns: 30,
  cellCharacters: 2000,
  sheets: 5,
  scannedRowsPerSheet: 1000,
});

function addWarning(warnings, warning) {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function boundedCell(value, warnings) {
  const text = String(value ?? '').trim();
  if (text.length > LIMITS.cellCharacters) addWarning(warnings, 'Some cell values were truncated.');
  return text.slice(0, LIMITS.cellCharacters);
}

function textDocument(content) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    throw new ApiError(422, 'INVALID_TEXT_ENCODING', 'Text and CSV documents must use UTF-8 encoding.');
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    throw new ApiError(422, 'INVALID_TEXT_DOCUMENT', 'The text document contains binary control characters.');
  }
  return text.replace(/^\uFEFF/, '');
}

// A deliberately small UTF-8 CSV reader: commas or semicolons, RFC-style quoted
// fields and escaped double quotes. No formula evaluation or separator guessing.
function parseCsv(text, delimiter = ',') {
  if (![',', ';'].includes(delimiter)) throw new ApiError(422, 'INVALID_CSV_DELIMITER', 'CSV delimiter must be comma or semicolon.');
  const rows = [];
  const warnings = [];
  let cells = [];
  let value = '';
  let state = 'plain';
  let cellTruncated = false;
  const append = (character) => {
    if (value.length < LIMITS.cellCharacters) value += character;
    else cellTruncated = true;
  };
  const finishCell = () => {
    if (cells.length < LIMITS.columns) cells.push(value.trim());
    else addWarning(warnings, 'Additional columns were not extracted.');
    if (cellTruncated) addWarning(warnings, 'Some cell values were truncated.');
    value = '';
    state = 'plain';
    cellTruncated = false;
  };
  const finishRow = () => {
    finishCell();
    if (cells.some(Boolean)) rows.push({ cells });
    cells = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (state === 'quoted') {
      if (character === '"') {
        if (text[index + 1] === '"') { append('"'); index += 1; }
        else state = 'closed';
      } else append(character);
      continue;
    }
    if (character === delimiter) finishCell();
    else if (character === '\n' || character === '\r') {
      finishRow();
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      if (rows.length === LIMITS.rows) {
        if (index < text.length - 1) addWarning(warnings, 'Additional rows were not extracted.');
        return { rows, warnings, text: rows.map((row) => row.cells.join(' | ')).join('\n') };
      }
    } else if (character === '"' && value.length === 0 && state === 'plain') state = 'quoted';
    else if (state === 'closed' && character.trim() !== '') throw new ApiError(422, 'INVALID_CSV', 'Unexpected text after a quoted CSV field.');
    else if (state === 'plain' && character === '"') throw new ApiError(422, 'INVALID_CSV', 'CSV quotes must wrap the entire field.');
    else if (state !== 'closed') append(character);
  }
  if (state === 'quoted') throw new ApiError(422, 'INVALID_CSV', 'The CSV document contains an unclosed quoted field.');
  if (value || cells.length || state === 'closed') finishRow();
  return { rows, warnings, text: rows.map((row) => row.cells.join(' | ')).join('\n') };
}

function spreadsheetValue(value, warnings) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return boundedCell(value, warnings);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (value.formula || value.sharedFormula) {
    addWarning(warnings, 'Formula cells were omitted; formulas and cached results are not trusted.');
    return '';
  }
  if (Array.isArray(value.richText)) return boundedCell(value.richText.map((part) => part.text || '').join(''), warnings);
  if (typeof value.text === 'string') return boundedCell(value.text, warnings); // Label only; never follow hyperlinks.
  return '';
}

async function parseSpreadsheet(content) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(content);
  } catch {
    throw new ApiError(422, 'INVALID_SPREADSHEET', 'The XLSX document could not be read.');
  }
  const warnings = [];
  const rows = [];
  const visible = workbook.worksheets.filter((sheet) => !sheet.state || sheet.state === 'visible');
  if (visible.length !== workbook.worksheets.length) addWarning(warnings, 'Hidden worksheets were not extracted.');
  if (visible.length > LIMITS.sheets) addWarning(warnings, 'Additional worksheets were not extracted.');
  for (const sheet of visible.slice(0, LIMITS.sheets)) {
    if (sheet.rowCount > LIMITS.scannedRowsPerSheet) addWarning(warnings, 'Only the first 1000 row positions of each worksheet were inspected.');
    for (let index = 1; index <= Math.min(sheet.rowCount, LIMITS.scannedRowsPerSheet); index += 1) {
      const row = sheet.getRow(index);
      if (!row.hasValues) continue;
      if (rows.length >= LIMITS.rows) { addWarning(warnings, 'Additional rows were not extracted.'); break; }
      if (row.cellCount > LIMITS.columns) addWarning(warnings, 'Additional columns were not extracted.');
      const cells = [];
      for (let column = 1; column <= Math.min(row.cellCount, LIMITS.columns); column += 1) {
        cells.push(spreadsheetValue(row.getCell(column).value, warnings));
      }
      if (cells.some(Boolean)) rows.push({ cells, sheet: sheet.name, rowNumber: index });
    }
  }
  return { text: rows.map((row) => row.cells.join(' | ')).join('\n'), rows, warnings };
}

module.exports = { LIMITS, addWarning, boundedCell, textDocument, parseCsv, parseSpreadsheet };

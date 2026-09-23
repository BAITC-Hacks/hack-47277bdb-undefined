const { isolateDocumentText } = require('./file-service');

const HEADERS = Object.freeze({
  name: ['name', 'product', 'product name', 'наименование', 'наименование товара', 'название', 'тауар', 'тауар атауы', 'өнім'],
  article: ['sku', 'article', 'артикул', 'код', 'артикулы'],
  quantity: ['quantity', 'qty', 'количество', 'кол-во', 'кол во', 'саны', 'сан'],
  unit: ['unit', 'ед', 'ед.', 'единица', 'бірлік', 'өлшем бірлігі'],
  technicalRequirements: ['requirements', 'specification', 'требования', 'характеристики', 'талаптар', 'сипаттамалар'],
});

function recognizeHeader(cells) {
  const normalized = cells.map((cell) => String(cell).trim().toLowerCase());
  const columns = {};
  for (const [field, aliases] of Object.entries(HEADERS)) {
    const index = normalized.findIndex((cell) => aliases.includes(cell));
    if (index !== -1) columns[field] = index;
  }
  // A quantity header is mandatory: never guess positional meaning or silently
  // reinterpret an article number as an order quantity.
  return columns.name !== undefined && columns.quantity !== undefined ? columns : null;
}

/** Produce source rows for a FUTURE user-reviewed specification workflow.
 * No fuzzy catalog confidence, compatibility claim, prices, stock snapshot,
 * persisted analysis or automatic cart action is inferred here.
 */
function extractSpecificationLines(document) {
  const rows = document?.extracted?.rows;
  const warnings = [];
  const items = [];
  let columns = null;
  let currentSheet;
  if (!Array.isArray(rows) || !rows.length) {
    return { items, requiresReview: true, needsColumnMapping: true, warnings: ['A table with explicit product-name and quantity headers is required; free text is not automatically converted to order lines.'] };
  }
  for (const [index, row] of rows.slice(0, 100).entries()) {
    if (!row || !Array.isArray(row.cells)) continue;
    if (row.sheet !== currentSheet) { columns = null; currentSheet = row.sheet; }
    const cells = row.cells.slice(0, 30).map((cell) => String(cell ?? '').trim().slice(0, 2000));
    const header = recognizeHeader(cells);
    if (header) { columns = header; continue; }
    if (!columns) continue;
    // Recheck even if the caller did not use processAssistantFile first.
    const safety = isolateDocumentText(cells.join('\n'));
    if (safety.ignoredInstructionCount || safety.redactedPaymentCount
      || cells.some((cell) => /\[(?:untrusted instruction removed|payment data redacted)\]/.test(cell))) {
      warnings.push(`Row ${row.rowNumber || index + 1} contains excluded content and needs manual review.`);
      continue;
    }
    const name = cells[columns.name];
    if (!name) continue;
    const rawQuantity = cells[columns.quantity] || '';
    const value = /^\d+(?:[.,]\d+)?$/.test(rawQuantity) ? Number(rawQuantity.replace(',', '.')) : NaN;
    const quantity = Number.isFinite(value) && value > 0 && value <= 1000000 ? value : null;
    const issues = [];
    if (quantity === null) issues.push('quantity_requires_clarification');
    else if (!Number.isInteger(quantity)) issues.push('fractional_quantity_requires_unit_review');
    const item = { lineNumber: row.rowNumber || index + 1, name, quantity, issues, requiresReview: true };
    if (row.sheet) item.sheet = row.sheet;
    for (const field of ['article', 'unit', 'technicalRequirements']) {
      if (columns[field] !== undefined && cells[columns[field]]) item[field] = cells[columns[field]];
    }
    items.push(item);
    if (items.length === 50) { warnings.push('Only the first 50 specification items were extracted.'); break; }
  }
  if (!items.length) warnings.push('No unambiguous specification rows were found; confirm column mapping and quantities manually.');
  return { items, requiresReview: true, needsColumnMapping: !items.length, warnings };
}

module.exports = { extractSpecificationLines };

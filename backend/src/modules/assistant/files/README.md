# Assistant document foundation (internal, optional)

This CommonJS module is part of the existing Express backend. It does **not**
start a server, add an upload route, create a store/table, save source bytes,
publish asset URLs, call an LLM, search products, or modify a cart/order.
Do not connect it to the public admin product-assets upload directory.

```js
const { processAssistantFile, extractSpecificationLines } = require('./files');
const document = await processAssistantFile({
  filename: 'specification.csv', mimeType: 'text/csv',
  content: Buffer.from('Name,SKU,Quantity\nCircuit breaker,DEMO-SKU,2'),
});
const proposal = extractSpecificationLines(document); // User review required.
```

`processAssistantFile(input, options?)` returns metadata, SHA-256, `untrusted:
true`, `requiresReview: true`, `extractionStatus`, bounded `extracted.text`,
`extracted.rows`, warnings and excluded-instruction/payment-redaction counts.
It never returns source bytes or an invented file identifier. A signature check
is format screening, **not** antivirus scanning or proof an image is decodable.

Supported paths:

- UTF-8 TXT/CSV: built-in parser, explicit comma delimiter by default;
  `options.csvDelimiter = ';'` enables semicolons. Invalid quoting fails closed.
- XLSX: existing ExcelJS; ZIP entry counts and declared **and actual** inflated
  sizes are checked first. Formula cells (including cached results), hidden
  sheets and hyperlink targets are not used. Macros, encrypted ZIPs, ZIP64,
  legacy XLS/DOC and macro-enabled extensions are unsupported.
- DOCX: lazy optional `mammoth.extractRawText`; raw text only, no HTML rendering
  or external-file access. The same bounded ZIP preflight applies.
- PDF: lazy optional `pdf-parse` v2 `PDFParse` adapter; first 10 pages of selectable
  text, with `destroy()` in `finally`. Scanned documents need future OCR.
- JPEG/PNG: signature checks and an honest metadata-only result by default;
  **no** image recognition/product identification is claimed.

If an optional dependency is absent, extraction reports `not_configured` with
empty text and a warning. No optional dependency is required to start the backend.
The trusted `options.documentParser`, `pdfParser`, and `imageParser` hooks receive
`(Buffer, {filename, mimeType})` and must return `{text, rows, warnings}` or `null`.
Passing `null` explicitly disables that format's parser. Hooks must not follow
external links or execute document instructions. They are application code, not
user-selected modules. Future OCR must be opt-in and disclose external transfer.

Limits: 10 MiB file, 24 MiB total expanded ZIP, 8 MiB per entry, 512 entries;
50,000 extracted text characters plus at most 50,000 characters in table cells,
100 rows, 30 columns, 2,000 characters/cell, 5 visible worksheets and first 1,000
row positions per worksheet. Specification proposals include at most 50 items.
Truncation is explicitly reported. Missing/invalid quantities remain `null`,
never silently become `1`; free text and unknown headers need manual mapping.

Obvious prompt-injection lines are omitted from **both text and rows**, and
possible card/security-code/IBAN data is redacted. These conservative heuristics
can miss attacks and produce false positives; they are not a security boundary.
All document content remains untrusted. It must never become system instructions
or authorize tools, stock mutations, checkout, payments or compatibility claims.

Future HTTP integration needs authenticated/session-bound ownership, request
rate limits, per-user quotas, CSRF/CORS policy, abortable isolated parser workers
(CPU/memory/wall-time limits), malware scanning, private expiring storage and an
explicit retention policy. In-process limits here bound data, not hostile-parser
CPU time. Persist metadata only through the existing Prisma layer if required;
do not revive the old `ai/` raw-Postgres or in-memory file/analysis stores.

Future matching must use the existing city-aware product/stock services, expose
uncertainty and require user confirmation. A similar label is not evidence of
electrical compatibility. Never infer live inventory, prices or cart actions
from a document or old analysis snapshot.

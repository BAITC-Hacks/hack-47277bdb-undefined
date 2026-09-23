# Assistant consolidation into the existing backend

## Result

The only supported application server is `backend/src/server.js` (Express + JavaScript/CommonJS, port 3000). The assistant is mounted at **POST /api/assistant/chat** in that same application. It uses the existing Prisma singleton, database, authentication, guest identity, localization, validation, error envelopes and CORS. There is no internal HTTP hop to a second catalog/cart backend and no new Prisma schema or database.

`ai/` has **not been deleted**. It is now a migration reference, with its startup/build/SQL-migration commands disabled to prevent accidentally reviving a second backend. No backend/frontend runtime imports it. Existing legacy SQL tables, if any, were not altered or dropped. Legacy conversations/files were not automatically imported because the old identity model is not compatible with authenticated backend ownership.

```text
frontend/                         existing React application, unchanged by this refactor
backend/
  prisma/schema.prisma            only Prisma schema; two assistant-only models added
  src/modules/assistant/
    assistant.routes.js           existing middleware + chat validation/rate limit
    assistant.controller.js       existing success envelope/localized response
    assistant.service.js          context, safe orchestration, pending-action transaction
    assistant.validation.js       explicit input allowlist
    assistant.safety.js            payment-data/electrical safety checks
    ai.service.js                 deterministic routing + optional read-only classifier
    prompts/system.prompt.js
    tools/product.tools.js        existing catalog/product/spec/availability services
    tools/cart.tools.js           shared CartService transaction logic
    tools/purchase.tools.js       existing published FAQ/pages/delivery service
    files/                        internal, bounded document-processing foundation
ai/                               retained legacy reference, not a supported server
```

## Inspected and migrated

Both projects were inspected before implementation: the old composition, agent/router, OpenAI classifier, catalog/analog matching, cart/session/security, file/specification pipeline and migrations; and the main Express mounts, middleware, env/Prisma, product-query/product/catalog/city, cart/transaction, delivery/content services and tests.

| Old `ai/` capability | Main-backend replacement | Deliberate changes |
| --- | --- | --- |
| `agents/ekt-agent.ts`, intent routing/language | assistant.service.js, ai.service.js, system.prompt.js | CommonJS; default kk, existing kk/ru locale handling; add intent is checked before cart-view intent |
| OpenAI intent classifier | ai.service.js | Optional Responses API structured read-only intent; fixed provider endpoint, 8s timeout, store:false, safe deterministic fallback; no provider key/error logging |
| Mock/live catalog adapters and query helpers | tools/product.tools.js | Direct calls to existing services; no mock data or separate HTTP catalog credentials |
| Analog/scoring/compatibility helpers | product.tools.js | Category and real typed-attribute comparison; only available city candidates; reasons/differences and explicit compatibility warning |
| Old cart adapters/proposal state machine | tools/cart.tools.js + AssistantPendingAction | Existing CartService is the only writer; no client prices/stock/owner IDs; shared atomic transaction |
| In-memory/raw-pg sessions/proposals | two models in existing Prisma schema | Owner-scoped persistent conversations; main JWT or guest UUID; no separate DB client/signing scheme |
| Hard-coded knowledge repository | tools/purchase.tools.js | Published main CMS/FAQ sources only; delivery estimates from existing rules; unknown minimum-order policy is not invented |
| Spreadsheet/document parsing and specification extraction | files/ | Existing ExcelJS, strict CSV/TXT, optional CommonJS DOCX/PDF adapters, JPEG/PNG metadata; review-only line extraction |
| Own Fastify routes/server/CORS/auth-like context/error types | existing Express infrastructure | Not migrated; this duplicate application layer is retired |
| Separate migrations/cart DB/mock data/file/audit/handoff stores | no replacement duplicate | Commerce already exists; no new file/audit/handoff database or false claim that a manager was contacted |

Old security issues deliberately not carried over: body-provided user IDs cannot establish identity; another caller cannot read/update a conversation using a supplied account ID; claiming a pending action and writing a cart no longer occur in separate transactions. Compound SKU/UUID strings cannot accidentally become current/curve specifications, and a fresh product description cannot silently reuse an older selected product.

## API contract

Success: `{success:true,data:{sessionId,language,city,type,intent,mode,message,...}}`.
Errors: existing `{success:false,error:{code,message,details?}}`.

Input allowlist:

| Field | Contract |
| --- | --- |
| message | Required nonempty string, max 4000 characters |
| sessionId | Optional UUID if already supplied in X-Session-Id. Guest body shorthand is supported. Body/header values must match. Authenticated caller with neither receives a new UUID and must reuse it on follow-ups. |
| city | Active city slug such as almaty; remembered in context; required before catalog price/stock/proposals |
| selectedProductId | Optional verified product UUID from search results; never a slug. Required to disambiguate multiple products unless a unique SKU resolves the choice. |
| quantity | Optional JSON integer 1–10000; otherwise explicit quantity words are parsed. 16А/C16 are not quantities. |
| pendingActionId | Echo the returned proposal ID on confirmation; strongly recommended for stale-tab protection. This field alone does not authorize anything. |

No userId, role, price, subtotal, stock, card fields, attachment text or arbitrary tool instructions are accepted. For guests, keep the same private random UUID as the site's cart in X-Session-Id. JWT identity wins for authenticated users; guest and account conversations/carts remain separate. This is the existing application's bearer-capability guest model, not a new authentication scheme. Never share a guest session UUID.

Language: `?lang=kk|ru` or `Accept-Language`; absent means remembered conversation language, initially kk. `Content-Language` matches the result. Rate limit is 30 assistant requests/minute/IP plus the existing global API limit.

### Example (PowerShell)

Use a newly generated UUID; do not reuse the illustrative value from someone else:

```powershell
$assistantSession = [guid]::NewGuid().ToString()
$headers = @{ 'X-Session-Id' = $assistantSession; 'Accept-Language' = 'kk' }
$requestBody = @{ message = 'Маған 16А автомат керек'; sessionId = $assistantSession; city = 'almaty' } | ConvertTo-Json
$found = Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/assistant/chat' -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($requestBody))
$found.data.products
```

Choose the actual returned product UUID yourself. To prepare, not execute, an addition:

```json
{
  "message": "3 данасын себетке қос",
  "sessionId": "YOUR_SESSION_UUID",
  "city": "almaty",
  "selectedProductId": "CHOSEN_PRODUCT_UUID"
}
```

The result has `type:"pending_action"`, a `pendingAction` with ID, product, quantity, city, current unit price and expiry, and a question such as **“3 данасын себетке қосайын ба?”**. No cart is created/changed and no stock is reserved at this point.

Only a subsequent explicit confirmation can write:

```json
{
  "message": "Иә, қос",
  "sessionId": "YOUR_SESSION_UUID",
  "pendingActionId": "RETURNED_PENDING_ACTION_UUID"
}
```

The result includes the existing serialized cart and relative frontend URLs `/cart` and `/checkout`. Send the same JWT/guest header identity as the quote. The accepted confirmation phrases are tightly anchored “Иә, қос”, “Да, добавь”, “Yes, add” and their limited punctuation/polite variants. Bare “yes”, negations, quoted or conditional sentences do not authorize a write. “Жоқ, қоспа” cancels. File content and model output can never confirm.

Without pendingActionId, the exact phrase confirms the currently pending action in that owner/session. Clients should always echo the ID to prevent stale UI messages from selecting a newer proposal. After success, duplicate confirmation is a no-op; the cart quantity is not incremented again.

## Cart and context safety

1. Input validation and existing optional JWT/guest identity middleware establish ownership. Payment-card-like content is rejected before storing history or calling a model; error messages do not echo the supplied details.
2. Search returns only real service DTOs. Multiple candidates require selection. A fresh SKU/category request does not inherit an unrelated previous product. Specifications, certificate/manual links, prices and stock are read from the existing catalog.
3. Preparation validates product, city, positive quantity, existing cart city and cumulative stock, then persists an expiring proposal. Default TTL is 900 seconds. It never creates/reprices the cart.
4. Confirmation locks the owner-scoped conversation in the existing serializable Prisma transaction. It verifies pending ID/status/expiry, selected product/city/quantity, current offer price, cart fingerprint and current stock including quantities already in the cart.
5. The same CartService `addItemInTransaction` helper is used by normal cart addition and assistant confirmation. The cart mutation and pending-action consumption commit together. There is no intermediate committed “confirming” state, nested transaction, duplicate commerce implementation or external HTTP call.
6. Concurrent/replayed confirmations cannot consume the same pending action twice. Any confirmation failure rolls the cart change back. A new accepted non-confirmation turn cancels an old proposal, including a failed new proposal. Schema-invalid requests rejected before the service are not accepted turns and leave state unchanged.
7. Price/cart/stock changes require review; city mismatch never silently reprices the existing cart. Set the cart city through the normal city/cart flow and request a fresh proposal.

Conversation state is in the same PostgreSQL database: last 20 bounded messages, language, city, current selection and recent product IDs. Context logically expires after 30 days of inactivity and resets on reuse. **This is not physical retention deletion**: deployment should add an explicit cleanup/retention policy before collecting real customer conversations at scale. Authenticated history cascades on deletion of its user; guest history has no account relation. Legacy history is not automatically trusted or imported.

Unavailable products return relevant real in-stock alternatives with technical reasons when matching alternatives exist. The assistant never fabricates an alternative if the catalog has none, and it does not label electrical compatibility as guaranteed. Purchase answers cite published local FAQ/CMS pages; seeded content remains synthetic demo policy, not verified EKT policy. A free-delivery threshold is not a minimum-order requirement. No card numbers, expiry, CVV/CVC or PIN are requested, accepted intentionally or used for payment.

## Optional provider and file input

Backend `.env` and `.env.example` now have:

```dotenv
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-4.1-mini"
ASSISTANT_LLM_ENABLED=false
ASSISTANT_PROPOSAL_TTL_SECONDS=900
```

The existing model default was retained. There was no configured OpenAI key in either project. Current verified operation is deterministic, using the real database, not mock products. To enable optional provider-assisted interpretation, put a valid key only in backend `.env`, set `ASSISTANT_LLM_ENABLED=true`, and restart the backend. No paid provider request was made during verification. Provider request/response handling, timeout fallback and malicious action classifications are unit-tested with a stubbed transport.

OpenAI Docs informed the constrained classifier's [Responses structured-output format](https://developers.openai.com/api/docs/guides/structured-outputs). The provider only returns a read-only intent/query; server code validates it. Model output is never returned as price, stock, certificate, compatibility, payment information or cart consent. The application uses Node's fetch; no second OpenAI SDK/configuration layer is needed.

The file foundation is **internal, not an exposed upload API**. XLSX uses the existing ExcelJS; CSV/TXT work without new dependencies. CommonJS Mammoth/PDFParse adapters preserve the useful Word/PDF implementations, but these optional packages are not installed in the main backend yet; missing parsers explicitly return not_configured. JPEG/PNG have signature/metadata validation and a future OCR hook, not invented image recognition. Parsed specification lines require review and never trigger cart actions.

See [files/README.md](backend/src/modules/assistant/files/README.md) for size/ZIP/text limits, injected-parser contracts, payment redaction, review flags and production isolation/scanning/private-storage prerequisites. No old file/database server is needed. A future frontend chat/file UI is out of this backend-refactor scope and was not added.

## Migration and verification

Added only `AssistantConversation` and `AssistantPendingAction` to the existing schema. Migration `20260923160000_assistant_context` creates these tables, owner/session indexes, status/quantity/price constraints and a one-pending-action-per-conversation index. No catalog/cart/stock/auth schema was duplicated, no database reset was run and no existing seed data was deleted.

For another checkout/environment, run from backend:

```powershell
npx prisma migrate deploy
npm run prisma:generate
npm run check
npm test
npm start
```

On Windows stop the backend before Prisma generation to avoid locking its query-engine DLL. With the server running, a second backend terminal can run `npm run check:assistant` and `npm run check:demo`. The assistant smoke uses fresh UUID-scoped fixtures and deletes only those test fixtures afterward; do not point it at a production customer database.

Verified here:

- Prisma schema validate, additive migrate deploy and client generation passed.
- Main backend starts; `/api/health` returns 200 with database connected.
- Real localhost `/api/assistant/chat` smoke passed: Kazakh catalog search, non-mutating quote, explicit confirmed addition, replay no-op, ordinary cart visibility and unchanged reservations.
- Full Jest suite: **287/287 tests, 9/9 suites**. Existing 103 commerce/docs/profile tests plus 80 assistant HTTP, 25 cart-transaction, 22 product/purchase tool, 22 provider/safety and 35 file tests.
- **130 JavaScript syntax checks and 110 source import checks** passed; Swagger includes the assistant input/output schema and route.
- Demo verification still reports 64 products, 39 categories, 9 cities, 12 warehouses, 576 offers, 768 stocks and 343 attribute values.
- Only the existing Prisma singleton is used; no runtime imports of ai/, new pg pool, second server, frontend API key or separate schema.

## Old files safe to delete after review (not deleted)

The main backend no longer depends on **any** runtime file in `ai/`. After retaining any private historical data/files you need, all old source/tooling can be removed in a separate user-approved cleanup:

- `ai/src/` — old Fastify/server/composition, agents, adapters, mocks, sessions, raw-pg stores, cart, files/specifications, matching, handoff, audit, schemas and domain types. Migrated runtime code is CommonJS under backend; unimplemented legacy network adapters are not required.
- `ai/tests/`, `ai/package.json`, `ai/package-lock.json`, `ai/tsconfig*.json`, `ai/eslint.config.js`, `ai/vitest.config.ts`, `ai/legacy-disabled.cjs`, and generated `ai/node_modules/` or `ai/dist/` if present.
- `ai/migrations/001_initial.sql`, `ai/migrations/002_postgresql_only_upgrade.sql`: not used by the backend migration chain. Archive first if they are needed as audit records of a legacy deployment. Deleting these files does **not** migrate or remove any old SQL tables; do not run them against the main database.
- `ai/docs/`, `ai/README.md`, `ai/.env.example` and old formatting/lint config files: archival documentation/tooling only, superseded by this report and backend Swagger.
- Any private `ai/.env`, uploads or database backups, if created outside this session: review/archive securely yourself before cleanup. No such credentials/data were silently transferred, published or deleted.

The folder is deliberately still present. No automatic recursive delete, database table drop, commit or push was performed.

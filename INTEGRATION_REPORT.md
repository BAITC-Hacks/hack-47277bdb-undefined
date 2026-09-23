# Frontend / Backend integration audit

## Initial audit — before implementation

Source of truth: actual Express mounts/routes/controllers/services and React API services/pages, not earlier documentation. Backend is JavaScript/CommonJS; frontend remains React/TypeScript/Vite. Database resets, seed deletion, AI implementation and a new admin dashboard are out of scope.

At audit start: **42 frontend HTTP call sites**, across 17 resource API service files (plus one shared Axios client). Most endpoints exist, but response adapters and real UI consumers are incomplete. Backend route inventory is being enumerated separately below. Working tree was clean at start (`b0c9459`).

### Initial integration matrix

Frontend feature / service | Frontend request | Actual backend route | Initial status / required fix
--- | --- | --- | ---
Login | POST /auth/login | POST /api/auth/login | MATCH path; UI placeholder, auth lifecycle incomplete
Register | POST /auth/register | POST /api/auth/register | MISMATCH name vs firstName/lastName; UI placeholder
Auth restore | GET /auth/me | GET /api/auth/me | MATCH path; clear expired token and refresh user-scoped state
Profile load | GET /users/me | absent | MISMATCH; add protected profile route using existing users module
Profile update | PATCH /users/me | absent | MISMATCH; add whitelisted profile update, never role
Cities list | GET /cities | GET /api/cities | MISMATCH mock mode; use real localized cities
City detail | GET /cities/:slug | GET /api/cities/:slug | MATCH path; normalize nullable details
Branches | GET /branches?city | GET /api/branches?city | MISMATCH phone fields and static Contacts page
Categories | GET /categories | GET /api/categories | MATCH path; remove UI mock dependencies
Category tree | GET /categories/tree | GET /api/categories/tree | MATCH path; real menu hierarchy
Category detail | GET /categories/:slug | GET /api/categories/:slug | MATCH path; real heading/breadcrumbs
Brands | GET /brands | GET /api/brands | MATCH path; real filter options
Product list/search | GET /products | GET /api/products | MISMATCH dropped pagination, price/image fields, missing city/query controls
Product detail | GET /products/:slug | GET /api/products/:slug | MISMATCH missing city, DTO assumptions, null safety
Availability | GET /products/:id/availability | GET /api/products/:id/availability | MISMATCH object treated as status string; missing city and UI consumer
Related products | GET /products/:id/related | GET /api/products/:id/related | MISMATCH missing city; UI uses mocks
Filter metadata | GET /catalog/categories/:slug/filters | same under /api | MISMATCH price object and possibleValues field names
Price list | GET /catalog/price-list | GET /api/catalog/price-list?city&format=xlsx | MISMATCH Blob treated as JSON; no download UI
Favorites list | GET /favorites | GET /api/favorites | MISMATCH membership wrappers treated as products; guest call causes 401
Favorite add | POST /favorites/:productId | same under /api | MATCH method/path; require login, refresh normalized list
Favorite remove | DELETE /favorites/:productId | same under /api | MISMATCH 204 decoded as JSON
Comparison list | GET /comparison | GET /api/comparison | MISMATCH matrix object treated as Product[]
Comparison add | POST /comparison/:productId | same under /api | MATCH path; refresh correct user/guest state
Comparison remove | DELETE /comparison/:productId | same under /api | MISMATCH 204 decoded as JSON
Comparison clear | DELETE /comparison | DELETE /api/comparison | MISMATCH 204 decoded as JSON
Cart load | GET /cart | GET /api/cart | MISMATCH city object, compact product, totalItemCount
Cart add | POST /cart/items | POST /api/cart/items | MATCH body productId/quantity; selected city must be synchronized first
Cart quantity | PATCH /cart/items/:itemId | same under /api | MATCH path/body; UI must use backend result/errors
Cart item delete | DELETE /cart/items/:itemId | same under /api | MATCH path; normalize returned cart
Cart clear | DELETE /cart | DELETE /api/cart | MISMATCH 204 treated as Cart
Cart city | PATCH /cart/city | PATCH /api/cart/city | MISMATCH UI sends slug where backend expects cityId UUID
Checkout | POST /orders | POST /api/orders | MISMATCH missing companyName/bin, discarded order result, redundant clear
Order history | GET /orders/me | GET /api/orders/me | MATCH path; real protected UI absent
Order detail | GET /orders/:id | GET /api/orders/:id | MATCH path; real protected UI absent
One-click request | POST /one-click-orders | POST /api/one-click-orders | MISMATCH cityId/quantity/customerName missing; button adds to cart instead
Promotions | GET /promotions | GET /api/promotions | MATCH path; homepage uses mocks
News list | GET /news | GET /api/news | MISMATCH top-level pagination lost; UI uses mocks
News detail | GET /news/:slug | GET /api/news/:slug | MATCH path; UI static placeholder
FAQ | GET /faqs | GET /api/faqs | MATCH path; UI uses mocks
Content page | GET /pages/:slug | GET /api/pages/:slug | MISMATCH content vs body; static UI placeholder
Customer request | POST /requests | POST /api/requests | MATCH path; typed form/payload and consumer missing
Image search | POST /search/image | absent | MISMATCH; explicitly unavailable, do not implement AI or issue bogus request

Cross-cutting mismatches: VITE_USE_MOCKS=true; direct mock imports in production pages/menu; empty Bearer on logout; no 401 state invalidation; city/language changes do not consistently reload; stock query is unused `stock`, invalid sort `popular`; missing price/dynamic filters and backend pagination; product null assumptions; untranslated/raw dates; no shared asset URL handling; unhandled request errors/loading states; fabricated contact information.

Initial public UI inventory: HomePage, CatalogPage, SearchPage, ProductPage, FavoritesPage, ComparePage, CartPage, CheckoutPage, InfoPage (news/FAQ/content/contacts/auth/account placeholders), NotFoundPage; MainLayout/header/menu; ProductCard and product controls; shared States; AppProviders. There is no admin dashboard. Existing design and route structure will be retained while placeholders are connected.

## Final result

Verified on 2026-09-23. Both existing applications are integrated without replacing their architecture. **51 backend declarations were present initially; 2 missing profile routes were added, giving 53 declarations (128 concrete operations after expanding the 16-resource admin CRUD router).** Documentation endpoints are separate. The frontend has **42 HTTP call sites across 17 resource API modules**, plus the shared client and two normalization helpers. Image search's nonexistent HTTP call was removed and a health-check call added, leaving the count unchanged.

The initial matrix above is historical. All listed contract mismatches are now **FIXED**, except image search, which is explicitly **UNAVAILABLE BY DESIGN** and sends no HTTP request. No unresolved route/method/DTO mismatch was found in the implemented public flows.

### Fixes applied

| Area | Final behavior |
| --- | --- |
| Environment/mocks | Local frontend .env and .env.example select localhost:3000/api and mocks=false. Mock mode is opt-in in development only; production cannot enable it. No page/layout imports mock inventory. |
| Transport | One Axios instance; persistent session UUID; nonempty Bearer token only; Accept-Language; clean query values; no duplicate /api prefix. Existing backend CORS allows both development origins. |
| Responses | Consistent data/list/void helpers preserve top-level pagination; 204 has no JSON parsing; XLSX uses Blob, including decoded backend errors on failed downloads. |
| Authentication | Exact returned JWT is stored; startup restores /auth/me; guest favorites are suppressed. Current-token 401 invalidates private state; late old-token 401 and failed-login 401 cannot log out a newer session. 403 does not log out. |
| Profile | Added protected GET/PATCH /users/me in the existing users module. Only firstName/lastName/phone are writable. Email, role, password, ID, isActive and unknown fields are rejected. Swagger updated. |
| Geography/localization | City selector uses real cities and persists a slug; catalog/detail/related/availability/filters use that slug. Cart changes resolve it to a city UUID before mutation. City/language changes reload dependent data. |
| Catalog | Real categories/tree/brands, search, category/brand/price/stock/new/special filters, metadata-driven attributes, exact eight sort values and server-side pagination. Attribute syntax is key:value,key:value. |
| Product DTOs | Central normalization handles image objects, nullable brand/offer, Decimal strings, technical values, offer vs cityOffer, nested delivery hours, branch phones and content vs body. No invented backend values. |
| Assets | Relative URLs resolve against backend origin. Actual uploads are served at /api/uploads, not /uploads. Missing images have a display fallback. |
| Saved lists | Favorite membership wrappers become product cards; comparison's matrix is mapped to per-product specifications. City-specific details are hydrated in the API layer. Guest comparison and authenticated favorites use separate identities. |
| Cart/state | Backend totalItemCount/subtotal and current price/stock are authoritative. Operations serialize; stale identity responses cannot overwrite another account. Add/update/remove/clear refresh UI counts without reload. |
| Checkout | Exact PERSON/COMPANY, delivery/payment enums; companyName/bin and address sent only when applicable. No prices/totals/stock sent. Server order result is displayed; already-cleared cart is refreshed, not deleted again. Submission waits for cart/city synchronization. Identity-keyed forms clear personal inputs/confirmation on account changes; late responses/errors are discarded after logout, account switch or unmount. |
| Content | Homepage promotions/news, paginated news/detail, FAQ, seven content pages, actual branches/contacts, all request types and one-click form now use services. Order history/detail and profile are real protected pages. |
| Errors | Loading/empty/retry/error states, product/news/page 404 states, friendly network/backend errors, safe dates/null prices. Stack traces/Axios internals are not displayed. |
| Exclusions | No AI, new admin dashboard, schema migration, database reset, seed replacement or payment-provider implementation. |

### Final frontend consumer map

Paths below are mounted backend paths. Request/auth/session/response details for **every** operation are in the complete contract appendix below. Public operations need no guest session; Identity operations need JWT or a persistent guest UUID; JWT/ADMIN operations require the corresponding authenticated user. Sending a guest UUID alongside a JWT does not change account ownership.

| Method and path | Service | Live page/component consumer |
| --- | --- | --- |
| GET /api/health | health.get | Verification harness only |
| POST /api/auth/register | auth.register | AuthPage through AppProviders |
| POST /api/auth/login | auth.login | AuthPage through AppProviders |
| GET /api/auth/me | auth.me | AppProviders startup/session/profile refresh |
| GET /api/users/me | users.me | AccountPage |
| PATCH /api/users/me | users.update | AccountPage |
| GET /api/cities | cities.list | AppProviders → MainLayout city selector |
| GET /api/cities/:slug | cities.get | No live UI consumer; HTTP harness checks Almaty detail |
| GET /api/branches | cities.branches | ContactsPage |
| GET /api/categories | categories.list | CatalogPage/SearchPage headings, breadcrumbs, selectors |
| GET /api/categories/tree | categories.tree | HomePage and MainLayout mega-menu |
| GET /api/categories/:slug | categories.get | No live UI consumer; HTTP harness only |
| GET /api/brands | brands.list | CatalogPage/SearchPage filters |
| GET /api/products | products.list | HomePage, CatalogPage, SearchPage |
| GET /api/products/:slug | products.get | ProductPage; saved-list card hydration |
| GET /api/products/:id/availability | products.availability | ProductPage warehouse/availability display |
| GET /api/products/:id/related | products.related | ProductPage related products |
| GET /api/catalog/categories/:slug/filters | catalog.filters | CatalogPage/SearchPage dynamic filters |
| GET /api/catalog/price-list | catalog.priceList | CatalogPage/SearchPage XLSX download |
| GET /api/favorites | favorites.list | AppProviders → FavoritesPage, ProductCard/ProductPage state, header |
| POST /api/favorites/:productId | favorites.add | ProductCard/ProductPage through AppProviders |
| DELETE /api/favorites/:productId | favorites.remove | ProductCard/ProductPage/FavoritesPage through AppProviders |
| GET /api/comparison | comparison.list | AppProviders → ComparePage, product controls, header |
| POST /api/comparison/:productId | comparison.add | ProductCard/ProductPage |
| DELETE /api/comparison/:productId | comparison.remove | ComparePage and product controls |
| DELETE /api/comparison | comparison.clear | ComparePage |
| GET /api/cart | cart.get | AppProviders → MainLayout count, CartPage, CheckoutPage |
| POST /api/cart/items | cart.addItem | ProductCard/ProductPage through AppProviders |
| PATCH /api/cart/items/:itemId | cart.updateItem | CartPage |
| DELETE /api/cart/items/:itemId | cart.removeItem | CartPage |
| DELETE /api/cart | cart.clear | CartPage |
| PATCH /api/cart/city | cart.setCity | AppProviders on city change/before first add |
| POST /api/orders | orders.create | CheckoutPage |
| GET /api/orders/me | orders.list | OrdersPage |
| GET /api/orders/:id | orders.get | OrderDetailPage |
| POST /api/one-click-orders | orders.oneClick | ProductPage OneClickDialog |
| GET /api/promotions | promotions.list | HomePage |
| GET /api/news | news.list | HomePage, NewsPage |
| GET /api/news/:slug | news.get | NewsDetailPage |
| GET /api/faqs | faq.list | FaqPage |
| GET /api/pages/:slug | pages.get | ContentPage: seven published slugs |
| POST /api/requests | requests.create | CustomerRequestForm in ContactsPage and B2B ContentPage |
| GET /api/uploads/:filename | resolveAssetUrl (not Axios) | ProductImage/gallery/document links when an asset URL exists |
| POST /api/admin/uploads | None | No admin frontend; Swagger/developer clients only |
| GET /api/admin/orders | None | No admin frontend |
| PATCH /api/admin/orders/:id/status | None | No admin frontend |
| GET /api/admin/requests | None | No admin frontend |
| PATCH /api/admin/requests/:id/status | None | No admin frontend |
| GET /api/admin/:resource | None | No admin frontend; all 16 resources listed below |
| POST /api/admin/:resource | None | No admin frontend; all 16 resources listed below |
| GET /api/admin/:resource/:id | None | No admin frontend; all 16 resources listed below |
| PATCH /api/admin/:resource/:id | None | No admin frontend; all 16 resources listed below |
| DELETE /api/admin/:resource/:id | None | No admin frontend; all 16 resources listed below |
| GET /api-docs.json; GET /api-docs and UI assets | None | Developer documentation, outside API count |

Thus **39 of 42 frontend HTTP methods have live UI consumers**. The other three are health, city detail and category detail. There are **85 admin operations** without a customer-frontend consumer (80 generic CRUD + 4 order/request operations + upload); this is intentional because no admin dashboard existed.

API-backed UI files: App.tsx (routes), MainLayout.tsx (header, city/language, search, mega-menu, saved/cart counts), ProductCard.tsx, ProductGrid.tsx/Pagination, States.tsx/useApiResource, AppContexts.tsx, and pages CatalogPages.tsx, ProductPage.tsx, CommercePages.tsx, AccountPages.tsx, ContentPages.tsx. Pages.tsx remains a re-export entry point. No component constructs a second HTTP client. There is no separate existing hooks directory; the shared resource hook lives in States.tsx.

### Verification evidence

| Check | Result |
| --- | --- |
| Backend startup and GET /api/health | HTTP 200; status OK; database connected |
| Prisma client generation | Passed, Prisma 6.19.3. Initial Windows DLL lock was released by stopping our test server, then generation succeeded. No migration required. |
| Backend npm run check | 107 JavaScript syntax checks; 93 source import checks; stock and validation/404 checks passed |
| Backend npm test | 103/103 tests, 4/4 suites, real PostgreSQL; includes 24 profile tests |
| Backend npm run check:demo | 64 products, 39 categories, 9 cities, 12 warehouses, 576 offers, 768 stock rows, 343 attribute values; all three availability statuses |
| Frontend npm run build | TypeScript and Vite production build passed |
| Frontend npm run check:integration | 15/15 real frontend-service HTTP flows; mocks=false |
| Frontend npm run check:contexts | 8/8 real React provider/client regression checks with isolated transport |
| Frontend npm run check:pages | 12/12 React page contract checks passed, including four delayed checkout identity/unmount regression cases |
| Frontend npm run dev | Starts at http://localhost:5173; GET / and /src/main.tsx return 200 with the correct app entry. strictPort prevents silent move to a CORS-incompatible port |
| Secrets | Both .env files are ignored; no local credential file included in changes |
| Browser visual QA | Unavailable: this tool session had no usable browser. DOM tests are not claimed as visual/browser E2E testing. |

Real HTTP flows exercise the actual TypeScript service modules through Vite SSR and Axios against the running Express server and PostgreSQL. They do not copy the request implementation. The test uses fresh UUID-scoped fixtures, then removes only those fixtures and its generated test upload. Seeded catalog data is also queried read-only.

Coverage of the requested eight end-to-end flows:

1. **Public catalog:** cities/categories/brands; real Almaty search for автомат; seeded circuit-breakers + schneider-electric + price + rated_current:16,poles:1; all eight sort values; pagination; product/specifications/city price/warehouse stock/related; kk/ru content.
2. **Guest cart:** persistent UUID, slug→UUID synchronization, add/update/delete/clear, stock rejection; DOM provider checks confirm reactive header count and serialized concurrent adds.
3. **Authentication:** register/login, exact token, /auth/me restoration, profile read/update, safe-field filtering; DOM checks cover login and identity transitions.
4. **Favorites:** authenticated add/list/remove, current-city hydration; guest protected requests suppressed.
5. **Comparison:** guest add/duplicate/two-product matrix/remove/clear over real HTTP; provider tests check identity-scoped comparison refresh. ComparePage renders normalized specifications (source-inspected, not a dedicated page interaction test).
6. **Checkout:** authenticated cart, COMPANY and DELIVERY payload, server totals, stock reservation, empty server cart; DOM checks exact enums, displayed server result and no redundant DELETE.
7. **Account orders:** own list/detail via real HTTP and protected React pages.
8. **Content:** promotions/news pagination/detail/FAQ/contacts/all seven pages; customer requests and one-click exact payload/no reservation.

Additional checks: both CORS origins and header preflight; 401 recovery/late-token protection/403 retention; no client-supplied authority fields; no duplicate /api; 404; actual XLSX workbook bytes; actual admin test PNG upload → public asset fetch → fixture cleanup.

### Remaining limitations and manual actions

- **No known blocking integration mismatch remains.** Open the app for a visual/manual smoke test; browser interaction and responsive layout could not be inspected in this session. Programmatic HTTP and React DOM coverage are documented separately above.
- Start PostgreSQL, then run backend and frontend in separate terminals using the root README. Dependencies and local frontend .env are already configured here. No reset or migration is needed for these integration changes.
- The backend has rate limits (300 API requests/15 min/IP, 20 auth attempts/15 min/IP). Repeated full test runs can hit 429; wait for the window or restart your local dev server. Do not disable production limits.
- Image search is visibly not configured and sends no request. No AI/chatbot was added.
- Payment methods are recorded, but no payment gateway charges a card. The UI states this explicitly.
- No admin dashboard was added. Use the existing authenticated Swagger/admin APIs if needed.
- Login does not merge a guest cart/comparison into the account; each identity's stored state is restored. Guest order confirmation is returned immediately, but the backend has no guest order-lookup endpoint.
- Category filtering matches the exact category, not descendants. Parent category pages offer child links. The actual seeded slug is circuit-breakers, not the prompt's illustrative modular-circuit-breakers.
- Backend detail omits unit/shortDescription/popularity; these remain optional, not fabricated. Quantity without a known unit is displayed neutrally.
- Russian selection localizes backend content; many static interface labels remain Kazakh. This integration did not add a full interface-translation system.
- Favorites summaries omit regional prices, so their API adapter hydrates product details with bounded concurrency (4). A future bulk detail endpoint could reduce requests for very large lists.
- Prisma emits an existing package.json#prisma deprecation warning for a future Prisma 7 migration; the current Prisma 6 build succeeds.
- These changes are not committed or pushed automatically. No prior database seed/user records were deleted.

## Complete final HTTP contract

The definitions below, combined with the consumer map above, specify each mounted method/path, authentication/session requirement, query/body and response. The separate [INTEGRATION_API_CONTRACT.md](INTEGRATION_API_CONTRACT.md) is also retained as a backend-focused reference.

### Shared contract

| Concern | Actual behavior |
| --- | --- |
| API prefix | `/api`; frontend Axios base URL is `http://localhost:3000/api` and service paths omit `/api` |
| Public access (`Public`) | No JWT required |
| Authenticated access (`JWT`) | `Authorization: Bearer <token>` or existing `token` cookie; account must exist and be active |
| Guest/user access (`Identity`) | JWT account if present; otherwise persistent `X-Session-Id` UUID is mandatory. Authenticated account wins when both headers are supplied. Invalid supplied JWT returns 401, not guest fallback |
| Administrator access (`ADMIN`) | Active JWT user with role exactly `ADMIN`; `CUSTOMER`/`MANAGER` receive 403 |
| Localization | `?lang=kk\|ru` wins over `Accept-Language`; default `kk`. Response `Content-Language` identifies selected language. Public localized fields are `name`, `description`, `title`, etc. rather than `nameKk/nameRu`; admin CRUD uses original bilingual fields |
| Success JSON (`S`) | `{ "success": true, "data": ... }` |
| Paginated JSON (`P`) | `{ "success": true, "data": [...], "pagination": { "page", "limit", "total", "totalPages" } }`; defaults page 1/limit 20, limit ≤100, empty totalPages is 0 |
| Errors | `{ "success": false, "error": { "code", "message", "details"? } }`; invalid input 422, insufficient stock 409, inaccessible order 404. Prisma internals/stack traces are hidden |
| Money | Catalog/cart/customer order responses convert Decimal to JSON numbers. Generic admin records and admin order-status responses may contain Decimal strings |
| Dates | ISO date-time strings; nullable dates stay null |
| Session persistence | Login does not merge guest cart/comparison into the account. User and guest state are separate owners |
| CORS | `CLIENT_URL`, `http://localhost:5173`, `http://127.0.0.1:5173`; credentials enabled; no wildcard origin |
| Throttling | All `/api` operations: 300 requests/15 minutes/IP; registration and login additionally share 20 requests/15 minutes/IP |
| Request parsing | JSON/form-urlencoded bodies ≤1 MiB. Duplicate query parameters producing arrays/objects are rejected 422. Do not serialize literal `undefined`/`null` values |
| Upload location | Files are served at `/api/uploads/<UUID>.<jpg\|png\|webp\|pdf>`, not `/uploads`. Relative URLs returned by this backend must resolve against the backend origin |

### Authentication, profile, geography, taxonomy

All rows below return `S` with HTTP 200 unless another status is specified. Every public localized read accepts the shared language setting.

| Method | Mounted path | Access | Query/body | `data` |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | Public | None | `{status:"OK", database:"connected", timestamp}`; unavailable DB →503 |
| POST | `/api/auth/register` | Public | Body: `email`, `password` ≥8 characters, `firstName` 1–100; optional `lastName` ≤100 and `phone` 5–30 | `{user: User, token}`, 201. Server creates CUSTOMER; does not set a cookie |
| POST | `/api/auth/login` | Public | Body: `email`, `password` ≥8 | `{user: User, token}`; invalid credentials →401 |
| GET | `/api/auth/me` | JWT | None | `User` |
| GET | `/api/users/me` | JWT | None | `User`; same public selection as auth/me |
| PATCH | `/api/users/me` | JWT | Nonempty object containing only `firstName?`, `lastName?`, `phone?`. First name 1–100, surname ≤100, phone 5–30 when nonempty. Strings trimmed. Null/empty surname or phone clears it | Updated `User`; omitted fields retained. `email`, `role`, `password`, `isActive`, `id` and unknown fields rejected 422 |
| GET | `/api/cities` | Public | None | Active localized `City[]` |
| GET | `/api/cities/:slug` | Public | City slug | Active `City` plus active `branches[]`; unknown slug →404 |
| GET | `/api/branches` | Public | `city?` = city slug | Active localized `Branch[]` with nested `city`; unknown city simply gives empty list |
| GET | `/api/categories` | Public | None | Flat active `Category[]` with `parentId` |
| GET | `/api/categories/tree` | Public | None | Root `Category[]`, each with recursive `children[]` |
| GET | `/api/categories/:slug` | Public | Category slug | Category plus direct active `children[]` and `attributeDefinitions[]`; unknown →404 |
| GET | `/api/brands` | Public | None | Active localized `Brand[]` |

Response fields:

- `User`: `id,email,phone,firstName,lastName,role,isActive,createdAt,updatedAt`. Password/hash is never returned.
- `City`: `id,slug,name,isActive,createdAt,updatedAt`.
- `Branch`: `id,cityId,name,address,phone1,phone2,email,workingHours,latitude,longitude,isActive,createdAt,updatedAt`; list endpoint also includes localized `city`. Coordinates are numbers/null in branch list; branches nested in city detail can serialize Prisma Decimal as strings.
- `Category`: `id,parentId,slug,name,description,imageUrl,sortOrder,isActive,createdAt,updatedAt`.
- `AttributeDefinition`: `id,categoryId,key,name,type,unit,filterable,sortable,sortOrder,createdAt,updatedAt`; type is `TEXT|NUMBER|BOOLEAN|SELECT`.
- `Brand`: `id,slug,name,logoUrl,description,isActive,createdAt,updatedAt`.

Email validators apply `trim().isEmail().normalizeEmail()`, including provider-specific canonicalization. Profile edits intentionally do not change the login email or password.

### Catalog and products

| Method | Mounted path | Access | Query/path contract | Result |
| --- | --- | --- | --- | --- |
| GET | `/api/products` | Public | Product queries below | `P` of `ProductCard` |
| GET | `/api/products/:slug` | Public | Product **slug**; `city?` slug, defaults almaty | `S` ProductDetail |
| GET | `/api/products/:id/availability` | Public | Product **UUID**; `city?` slug, defaults almaty | `S` Availability |
| GET | `/api/products/:id/related` | Public | Product UUID; `city?` slug; `limit?` 1–20, default 8 | `S` ProductCard[] |
| GET | `/api/catalog/categories/:slug/filters` | Public | Category slug; `city?` slug | `S` CategoryFilters |
| GET | `/api/catalog/price-list` | Public | `city?` slug, defaults almaty; `format?=xlsx` | Binary XLSX, not JSON. `Content-Disposition: attachment; filename="ekt-price-list-<city>.xlsx"` |

Supported product queries:

| Parameter | Meaning |
| --- | --- |
| `q` | 1–200 trimmed characters; case-insensitive SKU, supplier SKU, kk/ru name and brand name search |
| `city` | Active city slug, not UUID |
| `category` | Exact category slug, not UUID. Existing implementation does not automatically include descendants |
| `brand` | Exact active brand slug |
| `inStock` | Boolean; true means summed available stock >0, false means zero |
| `isNew`, `isSpecialOffer` | Booleans |
| `minPrice`, `maxPrice` | Inclusive nonnegative city web-price bounds; max must be ≥min |
| `attributes` | Single comma-separated string `rated_current:16,poles:1`; AND combination, maximum 20 pairs, string ≤2000 chars. Typed numeric/boolean and case-insensitive text equality |
| `sort` | `default`, `name_asc`, `name_desc`, `price_asc`, `price_desc`, `popularity_asc`, `popularity_desc`, `newest` |
| `page`, `limit` | Positive integers, limit ≤100 |
| `lang` | Shared localization |

There is no `isPopular` filter. Popularity is available through sorting. Seeded leaf category is `circuit-breakers`; the prompt's illustrative `modular-circuit-breakers` is not a seeded slug. Always discover IDs/slugs from real API data.

`ProductCard` fields:

```text
id, sku, supplierSku, slug, name, shortDescription, unit,
brand: {id,slug,name,logoUrl} | null,
category: {id,slug,name},
image: {url,alt} | null,
cityOffer: {id,webPrice,storePrice,availabilityStatus,deliveryEstimateHours} | null,
availableQuantity, availabilityStatus,
isNew, isSpecialOffer, isPopular, popularity, createdAt
```

Without city or a price/stock-dependent query, `cityOffer`, `availableQuantity`, `availabilityStatus` are null. Price range/sorting or inStock without city implicitly selects almaty. Related products likewise need `city` for regional values.

`ProductDetail` fields:

```text
id, sku, supplierSku, slug, name, description,
brand: {id,slug,name,logoUrl} | null, category: {id,slug,name},
images: [{id,url,alt,sortOrder,isPrimary}],
technicalSpecifications: [{key,name,type,unit,value}],
city: {id,slug,name} | null, cityOffer: Offer | null,
availableQuantity, availabilityStatus, certificateUrl, manualUrl,
isNew, isSpecialOffer, isPopular
```

Current detail does not return `unit`, `shortDescription`, or `popularity`; list DTO does. Delivery hours are nested in `cityOffer`, not a top-level field. Technical values may be string, number, boolean, or null.

`Availability` uses **`offer`**, not `cityOffer`:

```text
productId, sku, city: {id,slug,name} | null, offer: Offer | null,
availableQuantity, availabilityStatus,
warehouses: [{id,code,name,branchId,availableQuantity}]
```

`CategoryFilters`:

```text
category: {id,slug,name}, city: {id,slug} | null,
brands: [{id,slug,name,logoUrl}], price: {min,max},
attributes: [{key,name,type,unit,possibleValues:[string|number|boolean]}]
```

Metadata uses the exact category. Without city, price range is `{min:0,max:0}`. Availability enum is `IN_STOCK|ON_ORDER|OUT_OF_STOCK`; it is separate from computed stock. Available stock = sum(quantity − reserved) over active warehouses in the selected city.

### Favorites and comparison

| Method | Mounted path | Access | Input | Result |
| --- | --- | --- | --- | --- |
| GET | `/api/favorites` | JWT | None | `S` FavoriteEntry[] |
| POST | `/api/favorites/:productId` | JWT | UUID path; no body | 201 `S` `{id,userId,productId,createdAt}`; duplicate returns existing row |
| DELETE | `/api/favorites/:productId` | JWT | UUID path | **204, no body** |
| GET | `/api/comparison` | Identity | None | `S` Comparison |
| POST | `/api/comparison/:productId` | Identity | UUID path; no body | 201 `S` `{id,userId,sessionId,productId,createdAt}`; duplicate returns existing row; fifth distinct product →409 |
| DELETE | `/api/comparison/:productId` | Identity | UUID path | **204, no body** |
| DELETE | `/api/comparison` | Identity | None | **204, no body** |

`FavoriteEntry = {id,createdAt,product:{id,sku,slug,name,brand:{id,slug,name}|null,category:{id,slug,name},image:string|null}}`. Its outer ID is the favorite record, not product UUID. City query is not consumed; summaries do not contain prices or stock. A UI rendering full ProductCards must load corresponding current city product details through the service layer.

`Comparison = {products,attributes,count,maximum:4}`. Each product is `{id,sku,slug,name,brand:string|null,category:string,image:string|null}`. Each attribute is `{key,name,type,unit,values:{[productId]:value}}`. This is a matrix keyed by product UUID, not a product-specific specification array. Missing keys represent missing specification values. Comparison summaries do not carry price/stock.

### Cart

All cart routes require `Identity`; query `city` does not set the cart city.

| Method | Mounted path | Body/path | Result |
| --- | --- | --- | --- |
| GET | `/api/cart` | None | 200 `S` Cart |
| POST | `/api/cart/items` | `{productId:UUID,quantity:integer1..10000}` | 201 `S` Cart; adds to existing line quantity |
| PATCH | `/api/cart/items/:itemId` | CartItem UUID, `{quantity:integer1..10000}` | 200 `S` Cart; replaces line quantity |
| DELETE | `/api/cart/items/:itemId` | CartItem UUID, not product UUID | 200 `S` Cart |
| DELETE | `/api/cart` | None | **204, no body** |
| PATCH | `/api/cart/city` | `{cityId:UUID}` | 200 `S` Cart; creates cart if absent |

`Cart`:

```text
id: UUID | null,
city: {id,slug,name} | null,
items: [{
  id: CartItem UUID,
  product: {id,sku,slug,name,unit,brand:string|null,category:string,image:string|null},
  unitPrice:number, quantity:integer, lineTotal:number,
  availableQuantity:integer, availabilityStatus, warning:string|null
}],
subtotal:number, totalItemCount:integer,
warnings:[{itemId,productId,code}]
```

Absent cart is `{id:null,city:null,items:[],subtotal:0,totalItemCount:0,warnings:[]}`. First add defaults to almaty. To use another selected city, call PATCH `/cart/city` with that city's UUID before adding. City changes retain items and report warnings: `CITY_INACTIVE`, `PRODUCT_INACTIVE`, `OFFER_UNAVAILABLE`, `INSUFFICIENT_STOCK`.

Server computes unit prices and totals from offers. Send only productId/quantity, never price/lineTotal/stock. Add/update checks accumulated quantity against current available stock; insufficient quantity gives 409. Cart operations do not reserve stock; checkout does.

### Checkout and orders

| Method | Mounted path | Access | Input | Result |
| --- | --- | --- | --- | --- |
| POST | `/api/orders` | Identity | Checkout body below; city/items come from current cart | 201 `S` Order; reserves warehouse stock and deletes cart in a transaction |
| GET | `/api/orders/me` | JWT | None | `S` Order[], newest first; **not paginated** |
| GET | `/api/orders/:id` | JWT | Order UUID | `S` own Order; another owner's/guest order →404 |
| POST | `/api/one-click-orders` | Public | `productId`, `cityId` UUID; quantity 1–10000; customerName 2–150; phone 5–30; optional valid email | 201 `S` raw OneClickOrder; checks offer/stock but does not reserve or create full checkout order |

Checkout body:

| Field | Constraint |
| --- | --- |
| `customerName` | Required string, trimmed 2–150 |
| `phone` | Required string, trimmed 5–30 |
| `email` | Required valid normalized email |
| `customerType` | `PERSON|COMPANY` |
| `companyName` | Optional trimmed string ≤200; required for COMPANY |
| `bin` | Optional trimmed string exactly 12 chars; required for COMPANY |
| `deliveryMethod` | `PICKUP|DELIVERY` |
| `paymentMethod` | `ONLINE_CARD|CASH_ON_DELIVERY|POS_ON_PICKUP|BANK_TRANSFER` |
| `deliveryAddress` | Optional trimmed string ≤500; required for DELIVERY |
| `comment` | Optional trimmed string ≤1000 |

Do not submit authoritative items/prices/subtotal/deliveryPrice/total. The backend derives them from the stored cart, selected city offers, stock and delivery rules. Pickup is zero. Delivery uses the newest active city rule, falling back to newest active global rule. Free-delivery threshold is applied on the server. No payment gateway exists; payment method/status are recorded only.

`Order`:

```text
id, orderNumber, city:{id,slug,name},
customerName, phone, email, customerType, companyName, bin,
deliveryMethod, paymentMethod, deliveryAddress, comment,
subtotal:number, deliveryPrice:number, total:number,
status, paymentStatus, createdAt, updatedAt,
items:[{id,productId,productSlug,productName,sku,quantity,unitPrice:number,lineTotal:number}]
```

Order item names/SKU/prices are snapshots. `OrderStatus = NEW|CONFIRMED|PROCESSING|READY|SHIPPED|COMPLETED|CANCELLED`. `PaymentStatus = UNPAID|PENDING|PAID|FAILED|REFUNDED`. Online-card creation records PENDING; other methods UNPAID. Guest order details are returned at creation but cannot later be fetched through JWT owner routes; UI must preserve the creation response for guest confirmation.

`OneClickOrder`: `id,productId,cityId,quantity,customerName,phone,email,status,createdAt,updatedAt`; status initially NEW (`NEW|CONTACTED|COMPLETED|CANCELLED`).

### Content, requests and uploads

| Method | Mounted path | Access | Input | Result |
| --- | --- | --- | --- | --- |
| GET | `/api/promotions` | Public | Language | `S` active Promotion[], within startsAt/endsAt |
| GET | `/api/news` | Public | page/limit/language | `P` published News[], publication date ≤now |
| GET | `/api/news/:slug` | Public | News slug/language | `S` published News; missing/unpublished →404 |
| GET | `/api/faqs` | Public | Language | `S` published Faq[], sortOrder ascending |
| GET | `/api/pages/:slug` | Public | Page slug/language | `S` published ContentPage; missing →404 |
| POST | `/api/requests` | Public | `type?`, `name` 2–150, `phone` 5–30, `email?`, `company?` ≤200, `message?` ≤3000 | 201 `S` CustomerRequest, server status NEW |
| GET | `/api/uploads/:filename` | Public | Filename matches UUID-like 36 hex/hyphen chars + jpg/png/webp/pdf | Binary file, 404 if absent, 422 invalid filename |
| POST | `/api/admin/uploads` | ADMIN | Multipart `file`, max 5 MiB, JPEG/PNG/WEBP/PDF with matching signature | 201 `S` `{filename,url,mimeType,size}` |

Content fields:

- Promotion: `id,slug,title,description,imageUrl,startsAt,endsAt,isActive,createdAt,updatedAt`.
- News: `id,slug,title,excerpt,content,imageUrl,publishedAt,isPublished,createdAt,updatedAt`. Content is a string, not an array of content blocks.
- Faq: `id,question,answer,sortOrder,isPublished`.
- ContentPage: `id,slug,title,content,isPublished,createdAt,updatedAt`. Seed slugs: `delivery-and-payment`, `returns-and-exchange`, `how-to-order`, `online-payment`, `installment`, `privacy-policy`, `b2b`.
- CustomerRequest: `id,type,name,phone,email,company,message,status,createdAt,updatedAt`. Type `GENERAL|CALLBACK|B2B|CUSTOM_PANEL|COOPERATION` (default GENERAL), status `NEW|IN_PROGRESS|COMPLETED|REJECTED`.

### Administration

All routes below require ADMIN. Generic lists paginate but have no search/other filters. Generic writes reject unknown fields and nested relations. Original bilingual columns and raw Decimal strings are retained. Generic DELETE returns a **200 JSON record**, not 204.

| Method | Mounted path | Input | Result |
| --- | --- | --- | --- |
| GET | `/api/admin/orders` | page,limit,status? OrderStatus | `P` serialized Order[] across all users/guests |
| PATCH | `/api/admin/orders/:id/status` | `{status:OrderStatus,paymentStatus?:PaymentStatus}` | `S` raw Order record (Decimal strings, no city/items expansion). CANCELLED releases reserves; COMPLETED consumes quantity and reserved; these two statuses are final |
| GET | `/api/admin/requests` | page,limit,status? RequestStatus | `P` raw CustomerRequest[] |
| PATCH | `/api/admin/requests/:id/status` | `{status:RequestStatus}` | `S` raw CustomerRequest |
| GET | `/api/admin/:resource` | page,limit | `P` raw resource records |
| POST | `/api/admin/:resource` | Allowed create fields; required fields below | 201 `S` raw created record |
| GET | `/api/admin/:resource/:id` | Resource row UUID | `S` raw record |
| PATCH | `/api/admin/:resource/:id` | Nonempty subset of allowed fields | `S` updated raw record |
| DELETE | `/api/admin/:resource/:id` | Resource row UUID | `S` deleted/soft-disabled raw record |

The five generic declarations expand across the following **16** resources. Required create fields are also included in the allowed field list.

| Resource | Required create fields | Additional allowed fields | DELETE behavior |
| --- | --- | --- | --- |
| `cities` | slug,nameKk,nameRu | isActive | isActive=false |
| `branches` | cityId,nameKk,nameRu | addressKk,addressRu,phone1,phone2,email,workingHoursKk,workingHoursRu,latitude,longitude,isActive | isActive=false |
| `warehouses` | cityId,name,code | branchId,isActive | isActive=false |
| `categories` | slug,nameKk,nameRu | parentId,descriptionKk,descriptionRu,imageUrl,sortOrder,isActive | isActive=false |
| `brands` | slug,name | logoUrl,descriptionKk,descriptionRu,isActive | isActive=false |
| `products` | sku,slug,nameKk,nameRu,categoryId,unit | supplierSku,shortDescriptionKk,shortDescriptionRu,descriptionKk,descriptionRu,brandId,isActive,isNew,isSpecialOffer,isPopular,popularity,certificateUrl,manualUrl | isActive=false |
| `product-images` | productId,url | altKk,altRu,sortOrder,isPrimary | Physical delete |
| `attribute-definitions` | categoryId,key,nameKk,nameRu,type | unit,filterable,sortable,sortOrder | Physical delete |
| `attribute-values` | productId,attributeDefinitionId | textValue,numberValue,booleanValue; correct typed value required by definition | Physical delete |
| `product-offers` | productId,cityId,webPrice | storePrice,availabilityStatus,deliveryEstimateHours,isActive | isActive=false |
| `stock` | productId,warehouseId,quantity | reserved | Physical delete; relational constraints apply |
| `promotions` | slug,titleKk,titleRu | descriptionKk,descriptionRu,imageUrl,startsAt,endsAt,isActive | isActive=false |
| `news` | slug,titleKk,titleRu,contentKk,contentRu,publishedAt | excerptKk,excerptRu,imageUrl,isPublished | isPublished=false |
| `faqs` | questionKk,questionRu,answerKk,answerRu | sortOrder,isPublished | isPublished=false |
| `pages` | slug,titleKk,titleRu,contentKk,contentRu | isPublished | isPublished=false |
| `delivery-rules` | nameKk,nameRu | cityId,minimumFreeDeliveryAmount,deliveryPrice,estimatedHours,isActive | isActive=false |

Admin validation: UUID relation fields must be UUIDs; flags must be JSON booleans; integer fields nonnegative integers; Decimal fields finite nonnegative values; dates valid date inputs. Asset fields accept HTTP(S) or `/api/uploads/` URLs. `reserved` cannot exceed `quantity`. ProductAttributeValue definition must belong to the product category. There is no `offers` resource alias: use **`product-offers`**. There is no `content-pages` resource alias: use **`pages`**.

### Documentation and intentionally unavailable routes

| Method/path | Result |
| --- | --- |
| `GET /api-docs.json` | Raw OpenAPI document, no success envelope |
| `GET /api-docs` and UI asset paths | Swagger UI; separate from `/api` operation count |

No `/api/search/image` endpoint or AI implementation exists. Frontend image search must show an unavailable-feature message without pretending to search. No public warehouse list, customer order-cancel route, guest order lookup, password update, admin user CRUD, or admin one-click-order CRUD is mounted. There is no need to invent these calls for the current UI.

### Integration fixes and verification for profile

Before integration, frontend profile services requested GET/PATCH `/users/me` but the backend mounted no `/api/users` router. Both endpoints now exist with JWT authentication and an explicit safe-field allowlist. Email remains read-only. A new `backend/tests/users.test.js` suite runs against PostgreSQL, creates two isolated users, verifies only the authenticated user changes, checks validation/privilege-field rejection and absence of password hashes, then removes only those two users.

Verification: `npm test -- tests/users.test.js` passed **24/24 tests**. No schema migration, database reset, or AI endpoint was added.

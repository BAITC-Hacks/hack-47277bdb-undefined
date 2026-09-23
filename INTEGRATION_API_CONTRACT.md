# Backend route contract

This inventory comes from `backend/src/app.js`, every mounted route/controller/service, middleware, validators, and `prisma/schema.prisma`. It describes the actual HTTP contract after adding the missing profile routes. The integration matrix and verification results are in [INTEGRATION_REPORT.md](INTEGRATION_REPORT.md).

The original commerce inventory has **53 API method/path declarations**: **48 non-generic operations + 5 generic admin CRUD templates**. The allowlist has **16 admin resources**, so expanding those templates gives **128 commerce API operations** (`48 + 5 × 16`). The subsequently integrated assistant adds `POST /api/assistant/chat`, described below. Documentation endpoints are separate. `:id`, `:productId`, and `:itemId` below are UUIDs unless stated otherwise; `:slug` is a textual slug.

## Shared contract

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

## Integrated assistant

`POST /api/assistant/chat` is hosted by the same Express backend. The frontend uses the shared Axios client (`/assistant/chat`, not `/api/api/assistant/chat` or port 3001).

- Body: `{ message, city, selectedProductId?, quantity?, pendingActionId? }`. `city` is the selected slug. The widget omits body `sessionId` and reuses the client's `X-Session-Id` UUID, shared with the guest cart. Authenticated ownership comes from JWT.
- Response: `S` with `{ type, message, sessionId, language, city, intent, mode, ... }`. Products are existing backend product DTOs and go through the frontend's existing normalizer. No prices or stock are supplied by the browser.
- Product selection sends `selectedProductId`; specifications, certificate URLs, availability, alternatives and purchase information are returned by existing backend services.
- An add request returns `type: "pending_action"` plus `{ id, productId, productName, quantity, city, unitPrice, expiresAt }`. The cart is unchanged. A later explicit `Иә, қос` / `Да, добавь` plus this `pendingActionId` can produce `type: "cart"`. Then the frontend refreshes the normal cart and displays `/cart` and `/checkout` links.
- New messages invalidate old proposal controls. City/identity changes clear the local transcript/pending selection and discard late responses. Confirmation is not auto-retried on network errors. Secrets and payment-card details must not be sent by the frontend.
- Additional assistant limit: 30 requests/minute/IP. Full details and persistence constraints: [ASSISTANT_MIGRATION.md](ASSISTANT_MIGRATION.md).

## Authentication, profile, geography, taxonomy

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

## Catalog and products

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

## Favorites and comparison

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

## Cart

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

## Checkout and orders

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

## Content, requests and uploads

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

## Administration

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

## Documentation and intentionally unavailable routes

| Method/path | Result |
| --- | --- |
| `GET /api-docs.json` | Raw OpenAPI document, no success envelope |
| `GET /api-docs` and UI asset paths | Swagger UI; separate from `/api` operation count |

No `/api/search/image` endpoint or AI implementation exists. Frontend image search must show an unavailable-feature message without pretending to search. No public warehouse list, customer order-cancel route, guest order lookup, password update, admin user CRUD, or admin one-click-order CRUD is mounted. There is no need to invent these calls for the current UI.

## Integration fixes and verification for profile

Before integration, frontend profile services requested GET/PATCH `/users/me` but the backend mounted no `/api/users` router. Both endpoints now exist with JWT authentication and an explicit safe-field allowlist. Email remains read-only. A new `backend/tests/users.test.js` suite runs against PostgreSQL, creates two isolated users, verifies only the authenticated user changes, checks validation/privilege-field rejection and absence of password hashes, then removes only those two users.

Verification: `npm test -- tests/users.test.js` passed **24/24 tests**. No schema migration, database reset, or AI endpoint was added.

# EKT Store Backend — Phase 2

CommonJS REST API for a Kazakh/Russian electrical equipment store inspired by ekt.kz. Phase 2 adds regional catalog filtering, guest and authenticated shopping flows, transactional stock reservation, content APIs, admin CRUD, secure uploads, and an XLSX price list.

AI, chatbot, frontend, payment processing, and large demo datasets are intentionally outside this phase.

## Technologies

- Node.js 20+ and Express 5
- PostgreSQL and Prisma ORM
- JWT, bcrypt, Helmet, CORS, validation, and rate limiting
- ExcelJS for in-memory XLSX generation
- Multer for controlled uploads

## Structure

```text
backend/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── scripts/
│   ├── check.js
│   └── integration-check.js
├── src/
│   ├── config/
│   ├── middleware/
│   ├── modules/
│   │   ├── admin/
│   │   ├── auth/
│   │   ├── brands/
│   │   ├── branches/
│   │   ├── cart/
│   │   ├── catalog/
│   │   ├── categories/
│   │   ├── cities/
│   │   ├── comparison/
│   │   ├── delivery/
│   │   ├── faqs/
│   │   ├── favorites/
│   │   ├── health/
│   │   ├── news/
│   │   ├── one-click-orders/
│   │   ├── orders/
│   │   ├── pages/
│   │   ├── products/
│   │   ├── promotions/
│   │   ├── requests/
│   │   ├── uploads/
│   │   ├── users/
│   │   └── warehouses/
│   ├── utils/
│   ├── app.js
│   └── server.js
├── uploads/
├── .env.example
└── package.json
```

## Environment

Copy `.env.example` to `.env` and provide real credentials:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://admin:URL_ENCODED_PASSWORD@localhost:5432/ekt_store?schema=public"
JWT_SECRET="replace-with-a-real-long-random-secret"
JWT_EXPIRES_IN="7d"
CLIENT_URL="http://localhost:5173"
BCRYPT_ROUNDS=10
```

Reserved URL characters in the database password must be percent-encoded. For example, `/` becomes `%2F`.

## Setup and commands

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Other commands:

```bash
npm start
npm run prisma:studio
npm run check
npm run check:integration
```

`check:integration` creates an isolated temporary catalog in the configured database, verifies Phase 2 shopping behavior, and removes its records in a `finally` cleanup.

## Authentication and guest identity

Authenticated requests use:

```http
Authorization: Bearer YOUR_TOKEN
```

Guest cart and comparison requests require a client-generated UUID:

```http
X-Session-Id: 9f62f3c0-10eb-4f55-9d85-77c691e8728f
```

Prices and stock are never accepted from request bodies. Cart and checkout always read the active `ProductOffer` and warehouse stock for the selected city.

## Public API

### Foundation and catalog

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API and PostgreSQL health |
| POST | `/api/auth/register` | Register customer |
| POST | `/api/auth/login` | Get JWT |
| GET | `/api/auth/me` | Current user |
| GET | `/api/cities` | Active cities |
| GET | `/api/cities/:slug` | City details and branches |
| GET | `/api/branches?city=almaty` | Branches |
| GET | `/api/categories` | Flat category list |
| GET | `/api/categories/tree` | Recursive category tree |
| GET | `/api/categories/:slug` | Category and attributes |
| GET | `/api/brands` | Active brands |
| GET | `/api/products` | Advanced product search |
| GET | `/api/products/:slug` | Product details |
| GET | `/api/products/:id/availability?city=almaty` | Warehouse availability |
| GET | `/api/products/:id/related?city=almaty` | Related products |
| GET | `/api/catalog/categories/:slug/filters?city=almaty` | Dynamic filters |
| GET | `/api/catalog/price-list?city=almaty&format=xlsx` | XLSX price list |

`GET /api/products` supports `q`, `city`, `category`, `brand`, `inStock`, `isNew`, `isSpecialOffer`, `minPrice`, `maxPrice`, `attributes`, `sort`, `page`, and `limit`.

Attribute example:

```text
attributes=rated_current:16,poles:1
```

Sort values are `default`, `name_asc`, `name_desc`, `price_asc`, `price_desc`, `popularity_asc`, `popularity_desc`, and `newest`. Regional price sorting uses `ProductOffer.webPrice` for the selected city.

### Favorites, comparison, and cart

| Method | Endpoint |
| --- | --- |
| GET | `/api/favorites` |
| POST | `/api/favorites/:productId` |
| DELETE | `/api/favorites/:productId` |
| GET | `/api/comparison` |
| POST | `/api/comparison/:productId` |
| DELETE | `/api/comparison/:productId` |
| DELETE | `/api/comparison` |
| GET | `/api/cart` |
| POST | `/api/cart/items` |
| PATCH | `/api/cart/items/:itemId` |
| DELETE | `/api/cart/items/:itemId` |
| DELETE | `/api/cart` |
| PATCH | `/api/cart/city` |

Comparison accepts up to four products and returns a product matrix with localized technical attributes. Cart city changes recalculate offers and stock and return explicit warnings for unavailable items.

### Checkout and orders

| Method | Endpoint | Authentication |
| --- | --- | --- |
| POST | `/api/one-click-orders` | Public |
| POST | `/api/orders` | JWT or guest session |
| GET | `/api/orders/me` | JWT |
| GET | `/api/orders/:id` | JWT and owner-only |

Checkout runs in a serializable Prisma transaction. It locks warehouse stock rows, recalculates prices and delivery, creates snapshot order items, increments reservations, and clears the cart atomically. Cancelling releases reservations; completing deducts quantity and releases reservations. PostgreSQL CHECK constraints also enforce nonnegative money and `reserved <= quantity`.

### Content and contact

| Method | Endpoint |
| --- | --- |
| GET | `/api/promotions` |
| GET | `/api/news` |
| GET | `/api/news/:slug` |
| GET | `/api/faqs` |
| GET | `/api/pages/:slug` |
| POST | `/api/requests` |
| GET | `/api/uploads/:filename` |

Promotions and news apply active/publication date filters. Uploaded files are limited to 5 MB, use generated UUID filenames, and accept verified JPG, PNG, WEBP, or PDF signatures.

## Admin API

Every `/api/admin/*` endpoint requires a valid JWT with the `ADMIN` role.

To bootstrap the first administrator, register the account normally and update its role once through PostgreSQL or Prisma Studio:

```sql
UPDATE "User" SET "role" = 'ADMIN' WHERE "email" = 'admin@example.com';
```

Generic CRUD is available at:

```text
GET    /api/admin/:resource
POST   /api/admin/:resource
GET    /api/admin/:resource/:id
PATCH  /api/admin/:resource/:id
DELETE /api/admin/:resource/:id
```

Supported resources:

```text
cities, branches, warehouses, categories, brands, products,
product-images, attribute-definitions, attribute-values,
product-offers, stock, promotions, news, faqs, pages, delivery-rules
```

Catalog/content deletes use `isActive=false` or `isPublished=false` where the model supports it. Resource payloads are allow-listed and type checked.

Special admin endpoints:

| Method | Endpoint |
| --- | --- |
| GET | `/api/admin/orders` |
| PATCH | `/api/admin/orders/:id/status` |
| GET | `/api/admin/requests` |
| PATCH | `/api/admin/requests/:id/status` |
| POST | `/api/admin/uploads` |

Upload requests use `multipart/form-data` with a single `file` field.

## Phase boundary

No large seed is included. Realistic catalog data remains Phase 3 work.

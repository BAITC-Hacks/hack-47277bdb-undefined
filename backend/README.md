# EKT Store Backend — Phase 1

REST API foundation for an electrical equipment catalog inspired by ekt.kz. This phase covers authentication, localized catalog data, city-specific product offers, warehouse stock, and dynamic technical characteristics. It intentionally does not include cart, ordering, favorites, comparison, promotions, frontend, or AI features.

## Technologies

- JavaScript and Node.js (CommonJS)
- Express 5 REST API
- PostgreSQL
- Prisma ORM
- JWT authentication and bcrypt password hashing

## Project structure

```text
backend/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── config/
│   │   ├── env.js
│   │   └── prisma.js
│   ├── middleware/
│   ├── modules/
│   │   ├── auth/
│   │   ├── brands/
│   │   ├── branches/
│   │   ├── categories/
│   │   ├── cities/
│   │   ├── health/
│   │   ├── products/
│   │   ├── users/
│   │   └── warehouses/
│   ├── utils/
│   ├── app.js
│   └── server.js
├── .env.example
├── package.json
└── README.md
```

## PostgreSQL setup

Create a local PostgreSQL database named `ekt_store`. For example, from `psql`:

```sql
CREATE DATABASE ekt_store;
```

Copy `.env.example` to `.env`, then replace `YOUR_PASSWORD` and the JWT placeholder with your own values:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/ekt_store?schema=public"
JWT_SECRET="replace-with-a-long-random-secret"
JWT_EXPIRES_IN="7d"
CLIENT_URL="http://localhost:5173"
BCRYPT_ROUNDS=10
```

`DATABASE_URL` and `JWT_SECRET` are required. The application exits with a clear configuration error when either is missing.

## Install and initialize

```bash
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
```

The migration command creates the Phase 1 tables in the configured PostgreSQL database. No large demo seed is included in this phase.

## Run

Development with automatic restart:

```bash
npm run dev
```

Normal start:

```bash
npm start
```

Run the built-in syntax and HTTP middleware checks:

```bash
npm run check
```

Prisma Studio:

```bash
npm run prisma:studio
```

The default API base URL is `http://localhost:3000/api`. Localized resources use Kazakh by default. Select Russian with `?lang=ru` or an `Accept-Language: ru` header.

## Current endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Check API and PostgreSQL connectivity |
| POST | `/api/auth/register` | Register a customer |
| POST | `/api/auth/login` | Log in and receive a JWT |
| GET | `/api/auth/me` | Get the authenticated user |
| GET | `/api/cities` | List active cities |
| GET | `/api/cities/:slug` | Get a city and its branches |
| GET | `/api/branches?city=almaty` | List/filter branches |
| GET | `/api/categories` | List active categories |
| GET | `/api/categories/tree` | Get the recursive category tree |
| GET | `/api/categories/:slug` | Get category details and attributes |
| GET | `/api/brands` | List active brands |
| GET | `/api/products` | Search/filter/paginate products |
| GET | `/api/products/:slug` | Get localized product details |
| GET | `/api/products/:id/availability` | Get city and warehouse availability |

Product list filters are `q`, `city`, `category`, `brand`, `page`, and `limit`. `page` starts at 1 and `limit` accepts 1–100. Product details and availability accept `city`; when omitted, the temporary Phase 1 fallback is `almaty`.

Send authenticated requests with:

```http
Authorization: Bearer YOUR_TOKEN
```

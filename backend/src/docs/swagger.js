const express = require('express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { schemas, ref } = require('./schemas');
const { paths } = require('./paths');
const assistantDocs = require('./assistant');

const errors = {
  400: ['Invalid JSON or missing guest session.', 'SESSION_ID_REQUIRED', 'Қонақ сұрауы үшін X-Session-Id тақырыбы қажет'],
  401: ['Missing, invalid, expired token, or invalid login credentials.', 'AUTH_REQUIRED', 'Авторизация қажет'],
  403: ['The user does not have the required ADMIN role.', 'ADMIN_REQUIRED', 'Әкімші рұқсаты қажет'],
  404: ['The requested active resource was not found.', 'PRODUCT_NOT_FOUND', 'Тауар табылмады'],
  409: ['Duplicate value, insufficient stock, invalid state, or transaction conflict.', 'INSUFFICIENT_STOCK', 'Қоймадағы қолжетімді тауар саны жеткіліксіз'],
  413: ['Uploaded file exceeds 5 MiB.', 'FILE_TOO_LARGE', 'Файл көлемі 5 МБ-тан аспауы керек'],
  415: ['Unsupported type or invalid file content.', 'INVALID_FILE_CONTENT', 'Файл мазмұны жарияланған түріне сәйкес емес'],
  422: ['Invalid request fields or guest session UUID.', 'VALIDATION_ERROR', 'Деректер дұрыс емес'],
  429: ['Rate limit exceeded: global API 300/15 min; register/login 20/15 min per IP.', 'RATE_LIMIT_EXCEEDED', 'Сұраулар саны тым көп'],
  500: ['Internal error. Prisma internals and stack traces are not exposed.', 'INTERNAL_SERVER_ERROR', 'Серверде күтпеген қате пайда болды'],
  503: ['PostgreSQL is unavailable.', 'DATABASE_UNAVAILABLE', 'Дерекқорға қосылу мүмкін болмады'],
};

const swaggerSpec = swaggerJsdoc({
  failOnErrors: true,
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'EKT-inspired Demo Store API',
      version: '1.0.0',
      description: [
        'Hackathon backend, Phase 3. Catalog and content are synthetic demo data, not live EKT inventory or verified company policies.',
        'Start with GET /api/cities and GET /api/products?city=almaty. Discover real UUIDs/slugs from those responses; documentation examples are illustrative.',
        'Register/login for a JWT and use Authorize → bearerAuth. The backend also accepts an existing token cookie, but login does not create one. For guest cart/comparison/checkout use Authorize → guestSession with a random UUID (for example crypto.randomUUID()). Do not reuse a shared demo session identifier.',
        'Localization: lang=kk|ru, then Accept-Language, then kk. Successful JSON responses use {success:true,data}; paginated endpoints add pagination. Errors use {success:false,error:{code,message,details?}}. Amounts in public catalog/cart/order responses are numeric KZT.',
        'Checkout calculates prices, delivery and totals on the server, reserves active warehouse stock transactionally, and clears the cart. Online payment is a recorded method only; no payment provider is connected.',
      ].join('\n\n'),
    },
    servers: [{ url: '/', description: 'This backend (same origin)' }],
    tags: [
      'Health', 'Authentication', 'Cities', 'Branches', 'Categories', 'Brands',
      'Products', 'Catalog', 'Favorites', 'Comparison', 'Cart', 'One-click orders',
      'Orders', 'Content', 'Customer requests', 'Admin products', 'Admin orders',
      'Admin requests', 'Uploads', 'Assistant',
    ].map((name) => ({ name })),
    security: [],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT returned by register/login. Enter the token without the Bearer prefix.' },
        guestSession: { type: 'apiKey', in: 'header', name: 'X-Session-Id', description: 'Client-generated random UUID, kept private and reused for the same guest session. Alternative to bearerAuth on cart/comparison/checkout only.' },
      },
      schemas: { ...schemas, ...assistantDocs.schemas },
      responses: Object.fromEntries(Object.entries(errors).map(([status, [description, code, message]]) => [`Error${status}`, { description, content: { 'application/json': { schema: ref('Error'), example: { success: false, error: { code, message, ...(status === '409' ? { details: { requested: 100, available: 23 } } : {}) } } } } }])),
    },
    paths: { ...paths, ...assistantDocs.paths },
  },
  // Definitions live in explicit CommonJS modules so schemas and response helpers
  // stay reusable. swagger-jsdoc validates/normalizes the assembled OpenAPI document.
  apis: [],
});

const swaggerRouter = express.Router();
swaggerRouter.use((req, res, next) => {
  // Override only the documentation CSP. Swagger's scripts are served locally;
  // its UI needs inline styles but never requires unsafe-inline script execution.
  // Omitting upgrade-insecure-requests also keeps local HTTP docs usable.
  res.setHeader('Content-Security-Policy', [
    "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", "font-src 'self' data:", "connect-src 'self'",
    "base-uri 'self'", "object-src 'none'", "frame-ancestors 'self'",
  ].join('; '));
  next();
});
swaggerRouter.use(swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Demo Store API documentation',
  swaggerOptions: { persistAuthorization: false, validatorUrl: null, docExpansion: 'list' },
}));

module.exports = { swaggerSpec, swaggerRouter };

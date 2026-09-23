// OpenAPI schemas describe serialized HTTP responses, not Prisma records.
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const array = (items) => ({ type: 'array', items });
const object = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const text = { type: 'string' };
const nullableText = { type: 'string', nullable: true };
const uuid = { type: 'string', format: 'uuid' };
const nullableUuid = { ...uuid, nullable: true };
const integer = { type: 'integer', minimum: 0 };
const boolean = { type: 'boolean' };
const money = { type: 'number', minimum: 0, description: 'Amount in KZT.' };
const timestamp = { type: 'string', format: 'date-time' };
const timestamps = { createdAt: timestamp, updatedAt: timestamp };
const typedValue = { nullable: true, oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] };
const orderStatuses = ['NEW', 'CONFIRMED', 'PROCESSING', 'READY', 'SHIPPED', 'COMPLETED', 'CANCELLED'];
const paymentStatuses = ['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'];
const requestStatuses = ['NEW', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'];

const examples = {
  productId: '11111111-1111-4111-8111-111111111111',
  cityId: '22222222-2222-4222-8222-222222222222',
  categoryId: '33333333-3333-4333-8333-333333333333',
  register: { email: 'customer@example.test', password: 'Demo-Only-Change-2026!', firstName: 'Демо', lastName: 'Клиент' },
  login: { email: 'customer@example.test', password: 'Demo-Only-Change-2026!' },
  checkout: { customerName: 'Демо Клиент', phone: '+7 000 000 00 00', email: 'customer@example.test', customerType: 'PERSON', deliveryMethod: 'PICKUP', paymentMethod: 'POS_ON_PICKUP' },
  request: { type: 'B2B', name: 'Демо Клиент', phone: '+7 000 000 00 00', email: 'customer@example.test', company: 'Demo Company', message: 'Демонстрациялық электр қалқаны туралы сұрақ.' },
};

const schemas = {
  Error: object({
    success: { type: 'boolean', enum: [false] },
    error: object({ code: text, message: text, details: { description: 'Optional validation errors, conflicting fields, or stock information.' } }, ['code', 'message']),
  }, ['success', 'error']),
  Pagination: object({ page: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 }, total: integer, totalPages: integer }, ['page', 'limit', 'total', 'totalPages']),
  Health: object({ status: { type: 'string', example: 'OK' }, database: { type: 'string', example: 'connected' }, timestamp }),
  User: object({ id: uuid, email: { type: 'string', format: 'email' }, firstName: text, lastName: nullableText, phone: nullableText, role: { type: 'string', enum: ['CUSTOMER', 'ADMIN', 'MANAGER'] }, isActive: boolean, ...timestamps }),
  ProfileUpdateInput: { ...object({ firstName: { type: 'string', minLength: 1, maxLength: 100 }, lastName: { ...nullableText, maxLength: 100, description: 'null or an empty string clears the surname.' }, phone: { ...nullableText, maxLength: 30, description: '5–30 characters when nonempty. null or an empty string clears the phone.' } }), minProperties: 1, additionalProperties: false, description: 'Only firstName, lastName and phone are editable. Email, password, role, isActive and identifiers are rejected.' },
  AuthResult: object({ user: ref('User'), token: { type: 'string', description: 'Use as Authorization: Bearer <token>.' } }, ['user', 'token']),
  LoginInput: object({ email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8, format: 'password' } }, ['email', 'password']),
  RegisterInput: object({ email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8, format: 'password' }, firstName: { type: 'string', minLength: 1, maxLength: 100 }, lastName: { ...nullableText, maxLength: 100 }, phone: { ...nullableText, minLength: 5, maxLength: 30 } }, ['email', 'password', 'firstName']),
  CitySummary: object({ id: uuid, slug: { type: 'string', example: 'almaty' }, name: { type: 'string', example: 'Алматы' } }),
  City: object({ id: uuid, slug: text, name: text, isActive: boolean, ...timestamps }),
  Branch: object({ id: uuid, cityId: uuid, name: text, address: nullableText, phone1: nullableText, phone2: nullableText, email: nullableText, workingHours: nullableText, latitude: { type: 'number', nullable: true }, longitude: { type: 'number', nullable: true }, isActive: boolean, city: ref('City'), ...timestamps }),
  CityDetail: { allOf: [ref('City'), object({ branches: array(ref('Branch')) })] },
  CategorySummary: object({ id: uuid, slug: text, name: text }),
  AttributeDefinition: object({ id: uuid, categoryId: uuid, key: text, name: text, type: { type: 'string', enum: ['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT'] }, unit: nullableText, filterable: boolean, sortable: boolean, sortOrder: integer }),
  Category: object({ id: uuid, parentId: nullableUuid, slug: text, name: text, description: nullableText, imageUrl: nullableText, sortOrder: integer, isActive: boolean, ...timestamps }),
  CategoryTree: { allOf: [ref('Category'), object({ children: array(ref('CategoryTree')) })] },
  CategoryDetail: { allOf: [ref('Category'), object({ children: array(ref('Category')), attributeDefinitions: array(ref('AttributeDefinition')) })] },
  Brand: object({ id: uuid, slug: text, name: text, logoUrl: nullableText, description: nullableText, isActive: boolean, ...timestamps }),
  Offer: object({ id: uuid, webPrice: money, storePrice: { ...money, nullable: true }, availabilityStatus: { type: 'string', enum: ['IN_STOCK', 'ON_ORDER', 'OUT_OF_STOCK'] }, deliveryEstimateHours: { ...integer, nullable: true } }),
  Image: object({ id: uuid, url: text, alt: nullableText, sortOrder: integer, isPrimary: boolean }),
  Specification: object({ key: text, name: text, type: { type: 'string', enum: ['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT'] }, unit: nullableText, value: typedValue }),
  ProductCard: object({ id: uuid, sku: text, supplierSku: nullableText, slug: text, name: text, shortDescription: nullableText, unit: text, brand: { allOf: [ref('Brand')], nullable: true }, category: ref('CategorySummary'), image: { allOf: [ref('Image')], nullable: true }, cityOffer: { allOf: [ref('Offer')], nullable: true }, availableQuantity: { ...integer, nullable: true }, availabilityStatus: { type: 'string', nullable: true, enum: ['IN_STOCK', 'ON_ORDER', 'OUT_OF_STOCK', null] }, isNew: boolean, isSpecialOffer: boolean, isPopular: boolean, popularity: integer, createdAt: timestamp }),
  ProductDetail: object({ id: uuid, sku: text, supplierSku: nullableText, slug: text, name: text, description: nullableText, brand: { allOf: [ref('Brand')], nullable: true }, category: ref('CategorySummary'), images: array(ref('Image')), technicalSpecifications: array(ref('Specification')), city: { allOf: [ref('CitySummary')], nullable: true }, cityOffer: { allOf: [ref('Offer')], nullable: true }, availableQuantity: integer, availabilityStatus: { type: 'string', enum: ['IN_STOCK', 'ON_ORDER', 'OUT_OF_STOCK'] }, certificateUrl: nullableText, manualUrl: nullableText, isNew: boolean, isSpecialOffer: boolean, isPopular: boolean }),
  Availability: object({ productId: uuid, sku: text, city: { allOf: [ref('CitySummary')], nullable: true }, offer: { allOf: [ref('Offer')], nullable: true }, availableQuantity: integer, availabilityStatus: { type: 'string', enum: ['IN_STOCK', 'ON_ORDER', 'OUT_OF_STOCK'] }, warehouses: array(object({ id: uuid, code: text, name: text, branchId: nullableUuid, availableQuantity: integer })) }),
  CategoryFilters: object({ category: ref('CategorySummary'), city: { type: 'object', nullable: true, properties: { id: uuid, slug: text } }, brands: array(ref('Brand')), price: object({ min: money, max: money }), attributes: array(object({ key: text, name: text, type: text, unit: nullableText, possibleValues: array(typedValue) })) }),
  Favorite: object({ id: uuid, userId: uuid, productId: uuid, createdAt: timestamp }),
  FavoriteEntry: object({ id: uuid, createdAt: timestamp, product: object({ id: uuid, sku: text, slug: text, name: text, brand: { allOf: [ref('Brand')], nullable: true }, category: ref('CategorySummary'), image: nullableText }) }),
  CompactProduct: object({ id: uuid, sku: text, slug: text, name: text, brand: nullableText, category: text, image: nullableText, unit: text }),
  ComparisonItem: object({ id: uuid, userId: nullableUuid, sessionId: nullableUuid, productId: uuid, createdAt: timestamp }),
  Comparison: object({ products: array(ref('CompactProduct')), attributes: array(object({ key: text, name: text, type: text, unit: nullableText, values: { type: 'object', additionalProperties: typedValue, description: 'Keys are product UUIDs.' } })), count: { type: 'integer', minimum: 0, maximum: 4 }, maximum: { type: 'integer', enum: [4] } }),
  CartItem: object({ id: uuid, product: ref('CompactProduct'), unitPrice: money, quantity: { type: 'integer', minimum: 1 }, lineTotal: money, availableQuantity: integer, availabilityStatus: text, warning: nullableText }),
  Cart: object({ id: nullableUuid, city: { allOf: [ref('CitySummary')], nullable: true }, items: array(ref('CartItem')), subtotal: money, totalItemCount: integer, warnings: array(object({ itemId: uuid, productId: uuid, code: text })) }),
  CartAddInput: object({ productId: uuid, quantity: { type: 'integer', minimum: 1, maximum: 10000 } }, ['productId', 'quantity']),
  CartQuantityInput: object({ quantity: { type: 'integer', minimum: 1, maximum: 10000 } }, ['quantity']),
  CartCityInput: object({ cityId: uuid }, ['cityId']),
  CheckoutInput: object({ customerName: { type: 'string', minLength: 2, maxLength: 150 }, phone: { type: 'string', minLength: 5, maxLength: 30 }, email: { type: 'string', format: 'email' }, customerType: { type: 'string', enum: ['PERSON', 'COMPANY'] }, companyName: { ...nullableText, maxLength: 200, description: 'Required for COMPANY.' }, bin: { ...nullableText, minLength: 12, maxLength: 12, description: 'Required for COMPANY.' }, deliveryMethod: { type: 'string', enum: ['PICKUP', 'DELIVERY'] }, deliveryAddress: { ...nullableText, maxLength: 500, description: 'Required for DELIVERY.' }, paymentMethod: { type: 'string', enum: ['ONLINE_CARD', 'CASH_ON_DELIVERY', 'POS_ON_PICKUP', 'BANK_TRANSFER'] }, comment: { ...nullableText, maxLength: 1000 } }, ['customerName', 'phone', 'email', 'customerType', 'deliveryMethod', 'paymentMethod']),
  Order: object({ id: uuid, orderNumber: text, city: ref('CitySummary'), customerName: text, phone: text, email: text, customerType: text, companyName: nullableText, bin: nullableText, deliveryMethod: text, paymentMethod: text, deliveryAddress: nullableText, comment: nullableText, subtotal: money, deliveryPrice: money, total: money, status: { type: 'string', enum: orderStatuses }, paymentStatus: { type: 'string', enum: paymentStatuses }, ...timestamps, items: array(object({ id: uuid, productId: uuid, productSlug: text, productName: text, sku: text, quantity: { type: 'integer', minimum: 1 }, unitPrice: money, lineTotal: money })) }),
  OneClickInput: object({ productId: uuid, cityId: uuid, quantity: { type: 'integer', minimum: 1, maximum: 10000 }, customerName: { type: 'string', minLength: 2, maxLength: 150 }, phone: { type: 'string', minLength: 5, maxLength: 30 }, email: { type: 'string', format: 'email', nullable: true } }, ['productId', 'cityId', 'quantity', 'customerName', 'phone']),
  OneClickOrder: object({ id: uuid, productId: uuid, cityId: uuid, quantity: integer, customerName: text, phone: text, email: nullableText, status: { type: 'string', enum: ['NEW', 'CONTACTED', 'COMPLETED', 'CANCELLED'] }, ...timestamps }),
  Promotion: object({ id: uuid, slug: text, title: text, description: nullableText, imageUrl: nullableText, startsAt: { ...timestamp, nullable: true }, endsAt: { ...timestamp, nullable: true }, isActive: boolean, ...timestamps }),
  News: object({ id: uuid, slug: text, title: text, excerpt: nullableText, content: text, imageUrl: nullableText, publishedAt: timestamp, isPublished: boolean, ...timestamps }),
  Faq: object({ id: uuid, question: text, answer: text, sortOrder: integer, isPublished: boolean }),
  Page: object({ id: uuid, slug: text, title: text, content: text, isPublished: boolean, ...timestamps }),
  RequestInput: object({ type: { type: 'string', enum: ['GENERAL', 'CALLBACK', 'B2B', 'CUSTOM_PANEL', 'COOPERATION'], default: 'GENERAL' }, name: { type: 'string', minLength: 2, maxLength: 150 }, phone: { type: 'string', minLength: 5, maxLength: 30 }, email: { type: 'string', format: 'email', nullable: true }, company: { ...nullableText, maxLength: 200 }, message: { ...nullableText, maxLength: 3000 } }, ['name', 'phone']),
  CustomerRequest: object({ id: uuid, type: text, name: text, phone: text, email: nullableText, company: nullableText, message: nullableText, status: { type: 'string', enum: requestStatuses }, ...timestamps }),
  AdminProductInput: { ...object({ sku: text, supplierSku: nullableText, slug: text, nameKk: text, nameRu: text, shortDescriptionKk: nullableText, shortDescriptionRu: nullableText, descriptionKk: nullableText, descriptionRu: nullableText, categoryId: uuid, brandId: nullableUuid, unit: text, isActive: boolean, isNew: boolean, isSpecialOffer: boolean, isPopular: boolean, popularity: integer, certificateUrl: nullableText, manualUrl: nullableText }), additionalProperties: false, description: 'Allowed product fields. Offers, stock, images, and attributes have separate admin resources; nested writes are not accepted.' },
  AdminProductCreate: { allOf: [ref('AdminProductInput')], required: ['sku', 'slug', 'nameKk', 'nameRu', 'categoryId', 'unit'] },
  AdminProduct: object({ id: uuid, sku: text, supplierSku: nullableText, slug: text, nameKk: text, nameRu: text, shortDescriptionKk: nullableText, shortDescriptionRu: nullableText, descriptionKk: nullableText, descriptionRu: nullableText, categoryId: uuid, brandId: nullableUuid, unit: text, isActive: boolean, isNew: boolean, isSpecialOffer: boolean, isPopular: boolean, popularity: integer, certificateUrl: nullableText, manualUrl: nullableText, ...timestamps }),
  OrderStatusInput: object({ status: { type: 'string', enum: orderStatuses }, paymentStatus: { type: 'string', enum: paymentStatuses } }, ['status']),
  AdminOrderRecord: object({ id: uuid, orderNumber: text, userId: nullableUuid, cityId: uuid, status: { type: 'string', enum: orderStatuses }, paymentStatus: { type: 'string', enum: paymentStatuses }, subtotal: { type: 'string', example: '8400', description: 'Prisma Decimal serialized as string on this admin response.' }, deliveryPrice: { type: 'string', example: '0' }, total: { type: 'string', example: '8400' }, ...timestamps }),
  RequestStatusInput: object({ status: { type: 'string', enum: requestStatuses } }, ['status']),
  UploadedFile: object({ filename: text, url: { type: 'string', example: '/api/uploads/11111111-1111-4111-8111-111111111111.webp' }, mimeType: text, size: integer }),
};

examples.product = { id: examples.productId, sku: 'DEMO-C16', slug: 'demo-easy9-c16', name: 'Schneider Easy9 C16 (демо)', unit: 'дана', category: { id: examples.categoryId, slug: 'modular-circuit-breakers', name: 'Модульдік автоматты ажыратқыштар' }, cityOffer: { id: '44444444-4444-4444-8444-444444444444', webPrice: 4200, storePrice: 4400, availabilityStatus: 'IN_STOCK', deliveryEstimateHours: 24 }, availableQuantity: 23, availabilityStatus: 'IN_STOCK', isNew: true, isSpecialOffer: false, isPopular: true, popularity: 90 };
examples.cart = { id: '55555555-5555-4555-8555-555555555555', city: { id: examples.cityId, slug: 'almaty', name: 'Алматы' }, items: [{ id: '66666666-6666-4666-8666-666666666666', product: { id: examples.productId, sku: 'DEMO-C16', slug: 'demo-easy9-c16', name: 'Schneider Easy9 C16 (демо)', unit: 'дана', brand: 'Schneider Electric', category: 'Модульдік автоматты ажыратқыштар', image: null }, unitPrice: 4200, quantity: 2, lineTotal: 8400, availableQuantity: 23, availabilityStatus: 'IN_STOCK', warning: null }], subtotal: 8400, totalItemCount: 2, warnings: [] };
examples.order = { id: '77777777-7777-4777-8777-777777777777', orderNumber: 'EKT-20260923-1234ABCD', city: examples.cart.city, ...examples.checkout, companyName: null, bin: null, deliveryAddress: null, comment: null, subtotal: 8400, deliveryPrice: 0, total: 8400, status: 'NEW', paymentStatus: 'UNPAID', createdAt: '2026-09-23T10:00:00.000Z', updatedAt: '2026-09-23T10:00:00.000Z', items: [{ id: '88888888-8888-4888-8888-888888888888', productId: examples.productId, productSlug: 'demo-easy9-c16', productName: 'Schneider Easy9 C16 (демо)', sku: 'DEMO-C16', quantity: 2, unitPrice: 4200, lineTotal: 8400 }] };

module.exports = { schemas, examples, ref, array, object, uuid, orderStatuses, requestStatuses };

const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/prisma');
const { signToken } = require('../src/utils/jwt');
const { createFixture, resetCommerce, cleanupFixture } = require('./helpers/fixture');

let fixture;
const extraUserEmails = [];
const requestNames = [];
const api = () => request(app);
const customerHeaders = () => ({ Authorization: `Bearer ${fixture.tokens[0]}` });
const adminHeaders = () => ({ Authorization: `Bearer ${fixture.tokens[2]}` });
const guestHeaders = () => ({ 'X-Session-Id': randomUUID() });
const ids = (response) => response.body.data.map(({ id }) => id);
const catalog = (query = {}) => api().get('/api/products').query({ q: fixture.marker, ...query });
const checkoutPayload = (overrides = {}) => ({
  customerName: 'API Test Customer', phone: '+77000000000', email: fixture.users[0].email,
  customerType: 'PERSON', deliveryMethod: 'PICKUP', paymentMethod: 'POS_ON_PICKUP', ...overrides,
});
const prepareCart = async (headers, quantity = 2, product = fixture.products[0]) => {
  await api().patch('/api/cart/city').set(headers).send({ cityId: fixture.cities[0].id }).expect(200);
  return api().post('/api/cart/items').set(headers).send({ productId: product.id, quantity }).expect(201);
};
const checkout = (headers, overrides = {}) => api().post('/api/orders').set(headers).send(checkoutPayload(overrides));
const activeStock = async (product = fixture.products[0]) => {
  const stocks = await prisma.productStock.findMany({
    where: { productId: product.id, warehouse: { cityId: fixture.cities[0].id, isActive: true } },
  });
  return {
    quantity: stocks.reduce((total, stock) => total + stock.quantity, 0),
    reserved: stocks.reduce((total, stock) => total + stock.reserved, 0),
    stocks,
  };
};

beforeAll(async () => {
  fixture = await createFixture();
});

afterAll(async () => {
  try {
    if (extraUserEmails.length) await prisma.user.deleteMany({ where: { email: { in: extraUserEmails } } });
    if (requestNames.length) await prisma.customerRequest.deleteMany({ where: { name: { in: requestNames } } });
    await cleanupFixture(fixture);
  } finally {
    await prisma.$disconnect();
  }
});

describe('optional public text field validation', () => {
  const fields = {
    registration: ['lastName', 'phone'],
    order: ['companyName', 'bin', 'deliveryAddress', 'comment'],
    oneClick: ['email'],
    request: ['email', 'company', 'message'],
  };
  const valuesFor = (names, value) => Object.fromEntries(names.map((name) => [name, value]));
  const assertSafeValidation = (response, names) => {
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.map(({ field }) => field)).toEqual(expect.arrayContaining(names));
    expect(response.body).not.toHaveProperty('data');
    expect(response.body.error).not.toHaveProperty('stack');
    expect(response.body.error.details.every((detail) => !Object.hasOwn(detail, 'value'))).toBe(true);
    expect(response.text).not.toMatch(/TypeError|trim is not a function|Prisma|node_modules|postgresql:\/\//i);
  };
  const registrationPayload = (suffix, value) => {
    const email = `${fixture.marker}-opt-${suffix}@example.com`;
    extraUserEmails.push(email);
    return { email, password: fixture.password, firstName: 'Optional Test', ...valuesFor(fields.registration, value) };
  };
  const oneClickPayload = (value) => ({
    productId: fixture.products[0].id, cityId: fixture.cities[0].id, quantity: 1,
    customerName: 'Optional Test', phone: '+77000000000', ...valuesFor(fields.oneClick, value),
  });
  const requestPayload = (suffix, value) => {
    const name = `${fixture.marker}-optional-${suffix}`;
    requestNames.push(name);
    return { name, phone: '+77000000000', ...valuesFor(fields.request, value) };
  };

  test.each([false, 0])('registration rejects optional text=%p without leaking internals or saving a user', async (value) => {
    const payload = registrationPayload(`invalid-${value}`, value);
    const response = await api().post('/api/auth/register').send(payload).expect(422);
    assertSafeValidation(response, fields.registration);
    expect(await prisma.user.count({ where: { email: payload.email } })).toBe(0);
  });

  test.each([false, 0])('checkout rejects optional text=%p before creating any order', async (value) => {
    const response = await checkout(guestHeaders(), valuesFor(fields.order, value)).expect(422);
    assertSafeValidation(response, fields.order);
  });

  test.each([false, 0])('one-click orders reject optional email=%p before normalization', async (value) => {
    const before = await prisma.oneClickOrder.count({ where: { productId: fixture.products[0].id } });
    const response = await api().post('/api/one-click-orders').send(oneClickPayload(value)).expect(422);
    assertSafeValidation(response, fields.oneClick);
    expect(await prisma.oneClickOrder.count({ where: { productId: fixture.products[0].id } })).toBe(before);
  });

  test.each([false, 0])('customer requests reject optional text=%p without saving the invalid input', async (value) => {
    const payload = requestPayload(`invalid-${value}`, value);
    const response = await api().post('/api/requests').send(payload).expect(422);
    assertSafeValidation(response, fields.request);
    expect(await prisma.customerRequest.count({ where: { name: payload.name } })).toBe(0);
  });

  test.each([undefined, null, ''])('registration keeps omitted/null/empty optional text supported (%p)', async (value) => {
    const payload = registrationPayload(`valid-${String(value) || 'empty'}`, value);
    const response = await api().post('/api/auth/register').send(payload).expect(201);
    expect(response.body.data.user).toMatchObject({ lastName: null, phone: null });
  });

  test.each([undefined, null, ''])('checkout keeps omitted/null/empty optional text supported (%p)', async (value) => {
    const headers = guestHeaders();
    await prepareCart(headers, 1);
    const response = await checkout(headers, valuesFor(fields.order, value)).expect(201);
    expect(response.body.data).toMatchObject({ companyName: null, bin: null, deliveryAddress: null, comment: null });
    await api().patch(`/api/admin/orders/${response.body.data.id}/status`).set(adminHeaders())
      .send({ status: 'CANCELLED' }).expect(200);
  });

  test.each([undefined, null, ''])('one-click orders keep omitted/null/empty email supported (%p)', async (value) => {
    const response = await api().post('/api/one-click-orders').send(oneClickPayload(value)).expect(201);
    expect(response.body.data.email).toBeNull();
  });

  test.each([undefined, null, ''])('customer requests keep omitted/null/empty optional text supported (%p)', async (value) => {
    const payload = requestPayload(`valid-${String(value) || 'empty'}`, value);
    const response = await api().post('/api/requests').send(payload).expect(201);
    expect(response.body.data).toMatchObject({ email: null, company: null, message: null });
  });
});

describe('health and authentication over HTTP', () => {
  test('health confirms an actual PostgreSQL connection', async () => {
    const response = await api().get('/api/health').expect(200);
    expect(response.body).toMatchObject({ success: true, data: { status: 'OK', database: 'connected' } });
    expect(Number.isNaN(Date.parse(response.body.data.timestamp))).toBe(false);
  });

  test('registration rejects invalid email, short password and missing name without persisting a user', async () => {
    const response = await api().post('/api/auth/register').send({ email: 'invalid-email', password: '123' }).expect(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.map(({ field }) => field)).toEqual(expect.arrayContaining(['email', 'password', 'firstName']));
    expect(await prisma.user.count({ where: { email: 'invalid-email' } })).toBe(0);
  });

  test('registration hashes the password and ignores injected ADMIN role', async () => {
    const response = await api().post('/api/auth/register').send({
      email: fixture.registrationEmail, password: fixture.password, firstName: 'Registered', role: 'ADMIN',
    }).expect(201);
    expect(response.body.data.user.role).toBe('CUSTOMER');
    expect(response.body.data.user).not.toHaveProperty('password');
    const user = await prisma.user.findUnique({ where: { email: fixture.registrationEmail } });
    expect(user.role).toBe('CUSTOMER');
    expect(user.password).not.toBe(fixture.password);
    expect(await bcrypt.compare(fixture.password, user.password)).toBe(true);
    await api().get('/api/admin/products').auth(response.body.data.token, { type: 'bearer' }).expect(403);
  });

  test('login issues a working token but never returns a password hash', async () => {
    const response = await api().post('/api/auth/login').send({
      email: fixture.users[0].email, password: fixture.password,
    }).expect(200);
    expect(response.body.data.user.id).toBe(fixture.users[0].id);
    expect(response.body.data.user).not.toHaveProperty('password');
    const me = await api().get('/api/auth/me').auth(response.body.data.token, { type: 'bearer' }).expect(200);
    expect(me.body.data.id).toBe(fixture.users[0].id);
  });

  test('wrong passwords cannot obtain an access token', async () => {
    const response = await api().post('/api/auth/login').send({
      email: fixture.users[0].email, password: 'wrong-password',
    }).expect(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(response.body).not.toHaveProperty('data.token');
  });

  test('admin endpoints reject anonymous requests and customer accounts', async () => {
    const anonymous = await api().get('/api/admin/products').expect(401);
    expect(anonymous.body.error.code).toBe('AUTH_REQUIRED');
    const customer = await api().get('/api/admin/products').set(customerHeaders()).expect(403);
    expect(customer.body.error.code).toBe('ADMIN_REQUIRED');
  });

  test('admin authorization uses the current database role even if a token claims ADMIN', async () => {
    const token = signToken({ ...fixture.users[0], role: 'ADMIN' });
    await api().get('/api/admin/products').auth(token, { type: 'bearer' }).expect(403);
  });

  test.each(['invalid signature', 'malformed subject', 'unexpected algorithm'])('authentication rejects a token with %s', async (scenario) => {
    const token = scenario === 'invalid signature'
      ? jwt.sign({ sub: fixture.users[0].id }, randomUUID())
      : scenario === 'malformed subject'
        ? signToken({ id: 'not-a-uuid', role: 'CUSTOMER' })
        : jwt.sign({ sub: fixture.users[0].id }, process.env.JWT_SECRET, { algorithm: 'HS384' });
    const response = await api().get('/api/auth/me').auth(token, { type: 'bearer' }).expect(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });
});

describe('catalog query parameters, prices and stock', () => {
  test('pagination returns distinct pages with exact totals and omits inactive products', async () => {
    const first = await catalog({ page: '1', limit: '2' }).expect(200);
    const second = await catalog({ page: '2', limit: '2' }).expect(200);
    expect(first.body.pagination).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });
    expect(second.body.pagination).toEqual({ page: 2, limit: 2, total: 4, totalPages: 2 });
    expect(ids(first)).toEqual(fixture.products.slice(0, 2).map(({ id }) => id));
    expect(ids(second)).toEqual(fixture.products.slice(2, 4).map(({ id }) => id));
  });

  test('invalid pagination is rejected at the API boundary', async () => {
    const response = await catalog({ page: 0, limit: 101 }).expect(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('the selected city changes the same product price', async () => {
    const first = await catalog({ city: fixture.cities[0].slug }).expect(200);
    const second = await catalog({ city: fixture.cities[1].slug }).expect(200);
    expect(first.body.data.find(({ id }) => id === fixture.products[0].id).cityOffer.webPrice).toBe(123.45);
    expect(second.body.data.find(({ id }) => id === fixture.products[0].id).cityOffer.webPrice).toBe(130);
  });

  test('city stock sums quantity minus reservations in active warehouses only', async () => {
    const response = await api().get(`/api/products/${fixture.products[0].id}/availability`)
      .query({ city: fixture.cities[0].slug }).expect(200);
    expect(response.body.data.availableQuantity).toBe(12); // (10 - 2) + (5 - 1)
    expect(response.body.data.warehouses).toHaveLength(2);
    expect(response.body.data.warehouses.map(({ availableQuantity }) => availableQuantity).sort()).toEqual([4, 8]);
    expect(response.body.data.warehouses.map(({ id }) => id)).not.toContain(fixture.warehouses[2].id);
    const otherCity = await api().get(`/api/products/${fixture.products[0].id}/availability`)
      .query({ city: fixture.cities[1].slug }).expect(200);
    expect(otherCity.body.data.availableQuantity).toBe(6);
  });

  test('category filters exclude products in other categories', async () => {
    const response = await catalog({ category: fixture.categories[0].slug }).expect(200);
    expect(ids(response)).toEqual(fixture.products.slice(0, 2).map(({ id }) => id));
  });

  test('brand filters exclude products of another brand', async () => {
    const response = await catalog({ brand: fixture.brands[0].slug }).expect(200);
    expect(ids(response)).toEqual([fixture.products[0].id, fixture.products[2].id]);
  });

  test('numeric dynamic attributes match only the requested technical value', async () => {
    const response = await catalog({ attributes: 'rated_current:16' }).expect(200);
    expect(ids(response)).toEqual([fixture.products[0].id]);
    const noMatch = await catalog({ attributes: 'rated_current:63' }).expect(200);
    expect(noMatch.body.data).toEqual([]);
  });

  test('dynamic filter metadata contains real values and regional price ranges', async () => {
    const response = await api().get(`/api/catalog/categories/${fixture.categories[0].slug}/filters`)
      .query({ city: fixture.cities[0].slug }).expect(200);
    expect(response.body.data.attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'rated_current', type: 'NUMBER', possibleValues: [16, 25] }),
    ]));
    expect(response.body.data.price).toEqual({ min: 123.45, max: 200 });
  });

  test.each([
    ['true', [0, 1]],
    ['false', [2, 3]],
  ])('inStock=%s is converted from HTTP text to a boolean', async (value, expectedIndexes) => {
    const response = await catalog({ city: fixture.cities[0].slug, inStock: value }).expect(200);
    expect(ids(response)).toEqual(expectedIndexes.map((index) => fixture.products[index].id));
  });

  test.each([
    ['isNew', 'true', [0]],
    ['isNew', 'false', [1, 2, 3]],
    ['isSpecialOffer', 'true', [1]],
  ])('%s=%s reaches Prisma as a boolean', async (field, value, expectedIndexes) => {
    const response = await catalog({ [field]: value }).expect(200);
    expect(ids(response)).toEqual(expectedIndexes.map((index) => fixture.products[index].id));
  });

  test('regional min/max price filters and sorting work with numeric query strings', async () => {
    const response = await catalog({ city: fixture.cities[0].slug, minPrice: '120', maxPrice: '200', sort: 'price_desc' }).expect(200);
    expect(ids(response)).toEqual([fixture.products[1].id, fixture.products[0].id]);
    await catalog({ city: fixture.cities[0].slug, minPrice: '200', maxPrice: '100' }).expect(422);
  });

  test('product details expose localized names and typed specifications', async () => {
    const response = await api().get(`/api/products/${fixture.products[0].slug}`)
      .query({ city: fixture.cities[0].slug, lang: 'ru' }).expect(200);
    expect(response.body.data.name).toBe(fixture.products[0].nameRu);
    expect(response.body.data.technicalSpecifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'rated_current', value: 16, unit: 'A' }),
    ]));
  });

  test('admin pagination converts explicit strings and fills omitted defaults', async () => {
    const response = await api().get('/api/admin/products').set(adminHeaders()).query({ page: '1', limit: '2' }).expect(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.pagination).toMatchObject({ page: 1, limit: 2 });
    const defaults = await api().get('/api/admin/orders').set(adminHeaders()).expect(200);
    expect(defaults.body.pagination).toMatchObject({ page: 1, limit: 20 });
  });

  test('a Prisma foreign-key failure is converted into a safe public error', async () => {
    const response = await api().post('/api/admin/products').set(adminHeaders()).send({
      sku: `${fixture.marker}-invalid`, slug: `${fixture.marker}-invalid`,
      nameKk: 'Тест', nameRu: 'Тест', categoryId: randomUUID(), unit: 'дана',
    }).expect(409);
    expect(response.body.error.code).toBe('RELATED_RESOURCE_CONFLICT');
    expect(response.body.error).not.toHaveProperty('stack');
    expect(response.text).not.toMatch(/Prisma|P2003|node_modules|DATABASE_URL|postgresql:\/\//i);
  });
});

describe('cart, favorites, comparison and transactional checkout', () => {
  beforeEach(async () => {
    await resetCommerce(fixture);
  });

  test('a guest cart adds items and retains them only for that session', async () => {
    const headers = guestHeaders();
    const response = await prepareCart(headers, '2');
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({ quantity: 2, availableQuantity: 12 });
    const reloaded = await api().get('/api/cart').set(headers).expect(200);
    expect(reloaded.body.data.totalItemCount).toBe(2);
    const other = await api().get('/api/cart').set(guestHeaders()).expect(200);
    expect(other.body.data.items).toEqual([]);
  });

  test('authenticated carts use the account identity without requiring a guest session', async () => {
    const response = await prepareCart(customerHeaders());
    const persisted = await prisma.cart.findUnique({ where: { id: response.body.data.id } });
    expect(persisted.userId).toBe(fixture.users[0].id);
    expect(persisted.sessionId).toBeNull();
  });

  test('cart add and update reject quantities above stock without changing stored quantity', async () => {
    const headers = guestHeaders();
    const cart = await prepareCart(headers, 2);
    const added = await api().post('/api/cart/items').set(headers)
      .send({ productId: fixture.products[0].id, quantity: 11 }).expect(409);
    expect(added.body.error).toMatchObject({ code: 'INSUFFICIENT_STOCK', details: { requested: 13, available: 12 } });
    await api().patch(`/api/cart/items/${cart.body.data.items[0].id}`).set(headers).send({ quantity: 13 }).expect(409);
    const reloaded = await api().get('/api/cart').set(headers).expect(200);
    expect(reloaded.body.data.items[0].quantity).toBe(2);
  });

  test('cart totals ignore frontend price, lineTotal and stock fields', async () => {
    const headers = guestHeaders();
    await api().patch('/api/cart/city').set(headers).send({ cityId: fixture.cities[0].id }).expect(200);
    const response = await api().post('/api/cart/items').set(headers).send({
      productId: fixture.products[0].id, quantity: 2, unitPrice: 0.01, lineTotal: 0.02, stock: 999999, availableQuantity: 999999,
    }).expect(201);
    expect(response.body.data.items[0]).toMatchObject({ unitPrice: 123.45, lineTotal: 246.9, availableQuantity: 12 });
    expect(response.body.data.subtotal).toBe(246.9);
    expect(await activeStock()).toMatchObject({ quantity: 15, reserved: 3 });
  });

  test('concurrent adds cannot exceed stock or lose a successful addition', async () => {
    const headers = guestHeaders();
    await api().patch('/api/cart/city').set(headers).send({ cityId: fixture.cities[0].id }).expect(200);
    const responses = await Promise.all([8, 8].map((quantity) => api().post('/api/cart/items').set(headers)
      .send({ productId: fixture.products[0].id, quantity })));
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const cart = await api().get('/api/cart').set(headers).expect(200);
    expect(cart.body.data.items[0].quantity).toBe(8);
  });

  test('favorite add is idempotent and removal updates the account list', async () => {
    const path = `/api/favorites/${fixture.products[0].id}`;
    await api().post(path).set(customerHeaders()).expect(201);
    await api().post(path).set(customerHeaders()).expect(201);
    const list = await api().get('/api/favorites').set(customerHeaders()).expect(200);
    expect(list.body.data.map(({ product }) => product.id)).toEqual([fixture.products[0].id]);
    await api().delete(path).set(customerHeaders()).expect(204);
    const empty = await api().get('/api/favorites').set(customerHeaders()).expect(200);
    expect(empty.body.data).toEqual([]);
  });

  test('comparison prevents duplicate products for the same guest', async () => {
    const headers = guestHeaders();
    const path = `/api/comparison/${fixture.products[0].id}`;
    await api().post(path).set(headers).expect(201);
    await api().post(path).set(headers).expect(201);
    const response = await api().get('/api/comparison').set(headers).expect(200);
    expect(response.body.data.products.map(({ id }) => id)).toEqual([fixture.products[0].id]);
    expect(await prisma.comparisonItem.count({ where: { sessionId: headers['X-Session-Id'] } })).toBe(1);
  });

  test('checkout recalculates price and delivery while ignoring forged totals/status/stock', async () => {
    const headers = customerHeaders();
    await prepareCart(headers, 2);
    const response = await checkout(headers, {
      deliveryMethod: 'DELIVERY', deliveryAddress: 'Synthetic test address', paymentMethod: 'CASH_ON_DELIVERY',
      subtotal: 1, deliveryPrice: 0, total: 1, status: 'COMPLETED', paymentStatus: 'PAID',
      items: [{ productId: fixture.products[0].id, quantity: 99999, unitPrice: 0.01 }],
    }).expect(201);
    expect(response.body.data).toMatchObject({ subtotal: 246.9, deliveryPrice: 25, total: 271.9, status: 'NEW', paymentStatus: 'UNPAID' });
    expect(response.body.data.items[0]).toMatchObject({ quantity: 2, unitPrice: 123.45, lineTotal: 246.9 });
    const cart = await api().get('/api/cart').set(headers).expect(200);
    expect(cart.body.data.items).toEqual([]);
  });

  test('checkout uses the latest backend offer if price changes after cart insertion', async () => {
    const headers = guestHeaders();
    await prepareCart(headers, 2);
    const offer = fixture.offers.find((item) => item.productId === fixture.products[0].id && item.cityId === fixture.cities[0].id);
    await prisma.productOffer.update({ where: { id: offer.id }, data: { webPrice: '150.00' } });
    const response = await checkout(headers).expect(201);
    expect(response.body.data).toMatchObject({ subtotal: 300, deliveryPrice: 0, total: 300 });
    expect(response.body.data.items[0].unitPrice).toBe(150);
  });

  test('orders reserve stock in active city warehouses without deducting quantity', async () => {
    const headers = guestHeaders();
    await prepareCart(headers, 10);
    const response = await checkout(headers).expect(201);
    expect(await activeStock()).toMatchObject({ quantity: 15, reserved: 13 });
    const reservations = await prisma.orderStockReservation.findMany({ where: { orderItem: { orderId: response.body.data.id } } });
    expect(reservations).toHaveLength(2);
    expect(reservations.reduce((total, reservation) => total + reservation.quantity, 0)).toBe(10);
    expect(reservations.every(({ status }) => status === 'RESERVED')).toBe(true);
    const disabled = await prisma.productStock.findUnique({
      where: { productId_warehouseId: { productId: fixture.products[0].id, warehouseId: fixture.warehouses[2].id } },
    });
    expect(disabled).toMatchObject({ quantity: 100, reserved: 0 });
  });

  test('a customer cannot read another customer order or change its status', async () => {
    await prepareCart(customerHeaders());
    const order = await checkout(customerHeaders()).expect(201);
    await api().get(`/api/orders/${order.body.data.id}`).set(customerHeaders()).expect(200);
    const response = await api().get(`/api/orders/${order.body.data.id}`)
      .auth(fixture.tokens[1], { type: 'bearer' }).expect(404);
    expect(response.body.error.code).toBe('ORDER_NOT_FOUND');
    await api().patch(`/api/admin/orders/${order.body.data.id}/status`).set(customerHeaders()).send({ status: 'COMPLETED' }).expect(403);
  });

  test('cancellation releases every reservation exactly once', async () => {
    const headers = guestHeaders();
    await prepareCart(headers, 10);
    const order = await checkout(headers).expect(201);
    const path = `/api/admin/orders/${order.body.data.id}/status`;
    await api().patch(path).set(adminHeaders()).send({ status: 'CANCELLED' }).expect(200);
    await api().patch(path).set(adminHeaders()).send({ status: 'CANCELLED' }).expect(200);
    expect(await activeStock()).toMatchObject({ quantity: 15, reserved: 3 });
    const reservations = await prisma.orderStockReservation.findMany({ where: { orderItem: { orderId: order.body.data.id } } });
    expect(reservations).toHaveLength(2);
    expect(reservations.every(({ status }) => status === 'RELEASED')).toBe(true);
  });

  test('completion deducts stock exactly once and a final order cannot be cancelled', async () => {
    const headers = guestHeaders();
    await prepareCart(headers, 10);
    const order = await checkout(headers).expect(201);
    const path = `/api/admin/orders/${order.body.data.id}/status`;
    await api().patch(path).set(adminHeaders()).send({ status: 'COMPLETED' }).expect(200);
    await api().patch(path).set(adminHeaders()).send({ status: 'COMPLETED' }).expect(200);
    expect(await activeStock()).toMatchObject({ quantity: 5, reserved: 3 });
    const invalidTransition = await api().patch(path).set(adminHeaders()).send({ status: 'CANCELLED' }).expect(409);
    expect(invalidTransition.body.error.code).toBe('ORDER_STATUS_FINAL');
    const reservations = await prisma.orderStockReservation.findMany({ where: { orderItem: { orderId: order.body.data.id } } });
    expect(reservations.every(({ status }) => status === 'CONSUMED')).toBe(true);
  });

  test('concurrent checkouts cannot reserve more units than the city has available', async () => {
    const first = guestHeaders();
    const second = guestHeaders();
    await prepareCart(first, 8);
    await prepareCart(second, 8);
    const responses = await Promise.all([checkout(first), checkout(second)]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const rejected = responses.find(({ status }) => status === 409);
    expect(['INSUFFICIENT_STOCK', 'TRANSACTION_CONFLICT']).toContain(rejected.body.error.code);
    const totals = await activeStock();
    expect(totals).toMatchObject({ quantity: 15, reserved: 11 });
    expect(totals.stocks.every(({ quantity, reserved }) => quantity >= reserved && reserved >= 0)).toBe(true);
    expect(await prisma.order.count({ where: { cityId: fixture.cities[0].id } })).toBe(1);
    const reservations = await prisma.orderStockReservation.findMany({ where: { orderItem: { order: { cityId: fixture.cities[0].id } } } });
    expect(reservations.reduce((total, row) => total + row.quantity, 0)).toBe(8);
  });

  test('checkout revalidates changed stock and rolls back failed orders', async () => {
    const headers = guestHeaders();
    await prepareCart(headers, 10);
    for (const stock of fixture.stocks.filter((item) => item.productId === fixture.products[0].id &&
      fixture.warehouses.slice(0, 2).some(({ id }) => id === item.warehouseId))) {
      await prisma.productStock.update({ where: { id: stock.id }, data: { reserved: stock.quantity } });
    }
    const response = await checkout(headers).expect(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await prisma.order.count({ where: { cityId: fixture.cities[0].id } })).toBe(0);
    const cart = await api().get('/api/cart').set(headers).expect(200);
    expect(cart.body.data.items[0].quantity).toBe(10);
  });

  test('a later item stock failure rolls back reservations already allocated to earlier items', async () => {
    const headers = guestHeaders();
    const [first, last] = fixture.products.slice(0, 2).sort((left, right) => left.id.localeCompare(right.id));
    await prepareCart(headers, 2, first);
    await api().post('/api/cart/items').set(headers).send({ productId: last.id, quantity: 2 }).expect(201);
    const firstBefore = await activeStock(first);
    const lastBefore = await activeStock(last);
    for (const stock of lastBefore.stocks) {
      await prisma.productStock.update({ where: { id: stock.id }, data: { reserved: stock.quantity } });
    }
    const response = await checkout(headers).expect(409);
    expect(response.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await activeStock(first)).toMatchObject({ quantity: firstBefore.quantity, reserved: firstBefore.reserved });
    expect(await prisma.order.count({ where: { cityId: fixture.cities[0].id } })).toBe(0);
    const cart = await api().get('/api/cart').set(headers).expect(200);
    expect(cart.body.data.items).toHaveLength(2);
  });

  test('checkout rejects a city disabled after the cart was created', async () => {
    const headers = guestHeaders();
    await prepareCart(headers, 2);
    await prisma.city.update({ where: { id: fixture.cities[0].id }, data: { isActive: false } });
    try {
      const response = await checkout(headers).expect(409);
      expect(response.body.error.code).toBe('CITY_INACTIVE');
      expect(await prisma.order.count({ where: { cityId: fixture.cities[0].id } })).toBe(0);
      expect(await activeStock()).toMatchObject({ quantity: 15, reserved: 3 });
    } finally {
      await prisma.city.update({ where: { id: fixture.cities[0].id }, data: { isActive: true } });
    }
  });

  test('admin stock validation rejects negative quantities and reservations above quantity', async () => {
    const stock = fixture.stocks[0];
    const path = `/api/admin/stock/${stock.id}`;
    await api().patch(path).set(adminHeaders()).send({ quantity: -1 }).expect(422);
    await api().patch(path).set(adminHeaders()).send({ reserved: stock.quantity + 1 }).expect(422);
    const unchanged = await prisma.productStock.findUnique({ where: { id: stock.id } });
    expect(unchanged).toMatchObject({ quantity: stock.quantity, reserved: stock.reserved });
  });
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Exercise the actual frontend TypeScript API services over HTTP, not copied
// request implementations. Only fresh UUID-scoped fixtures are mutated.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backendRequire = createRequire(path.join(root, 'backend/package.json'));
backendRequire('dotenv').config({ path: path.join(root, 'backend/.env'), quiet: true });
const db = backendRequire('./src/config/prisma');
const { createFixture, cleanupFixture } = backendRequire('./tests/helpers/fixture');
const storage = new Map();
const browser = new EventTarget();
browser.location = { origin: 'http://localhost:5173' };
browser.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
browser.setTimeout = setTimeout;
globalThis.window = browser;
let fixture;
let vite;
let uploadedTestFile;
const completed = [];
const check = async (name, operation) => { await operation(); completed.push(name); console.log(`PASS ${name}`); };

try {
  vite = await createServer({ root: path.join(root, 'frontend'), server: { middlewareMode: true }, appType: 'custom' });
  const load = (file) => vite.ssrLoadModule(`/src/${file}`);
  const { default: api, AUTH_INVALIDATED_EVENT, cleanQueryParams, extractApiError } = await load('api/client.ts');
  // Node's fetch adapter preserves real Blob responses (the browser uses XHR).
  api.defaults.adapter = 'fetch';
  const sentRequests = [];
  api.interceptors.request.use((config) => {
    sentRequests.push({ method: config.method, url: config.url, fields: Object.keys(config.data || {}) });
    return config;
  });
  const modules = {};
  for (const name of ['health', 'auth', 'users', 'cities', 'categories', 'brands', 'products', 'catalog', 'cart', 'favorites', 'comparison', 'orders', 'news', 'promotions', 'faq', 'pages', 'requests']) {
    modules[name] = (await load(`api/${name}.api.ts`))[`${name}Api`];
  }
  const { useMocks } = await load('mocks/mock-api.ts');
  assert.equal(useMocks, false, 'Run integration with VITE_USE_MOCKS=false');
  assert.equal(api.defaults.baseURL, 'http://localhost:3000/api');
  await check('Backend health + CORS preflight', async () => {
    assert.equal((await modules.health.get()).database, 'connected');
    const response = await fetch(`${api.defaults.baseURL}/health`, { headers: { Origin: browser.location.origin } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.database, 'connected');
    assert.equal(response.headers.get('access-control-allow-origin'), browser.location.origin);
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
      const preflight = await fetch(`${api.defaults.baseURL}/cart/items`, { method: 'OPTIONS', headers: {
        Origin: origin, 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,x-session-id,accept-language',
      } });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    }
  });
  fixture = await createFixture();
  storage.set('selectedCity', fixture.cities[0].slug);
  storage.set('selectedLanguage', 'kk');
  storage.set('sessionId', randomUUID());
  const product = fixture.products[0];
  await check('Real cities, categories/tree/detail, brands and branches', async () => {
    assert.ok((await modules.cities.list()).some((item) => item.id === fixture.cities[0].id));
    assert.equal((await modules.cities.get('almaty')).slug, 'almaty');
    assert.ok((await modules.categories.tree()).length > 0);
    assert.equal((await modules.categories.get(fixture.categories[0].slug)).id, fixture.categories[0].id);
    assert.ok((await modules.brands.list()).some((item) => item.id === fixture.brands[0].id));
    assert.ok((await modules.cities.branches('almaty')).length > 0);
  });
  await check('Product search + city + brand/category/price/attribute filters + sort/pagination', async () => {
    const base = { q: fixture.marker, city: fixture.cities[0].slug };
    const first = await modules.products.list({ ...base, page: 1, limit: 2 });
    const second = await modules.products.list({ ...base, page: 2, limit: 2 });
    assert.equal(first.pagination.total, 4);
    assert.equal(first.pagination.totalPages, 2);
    assert.ok(first.data.every((item) => !second.data.some((other) => other.id === item.id)));
    const filtered = await modules.products.list({ ...base, category: fixture.categories[0].slug, brand: fixture.brands[0].slug,
      minPrice: 120, maxPrice: 150, inStock: true, attributes: { rated_current: 16 }, sort: 'price_asc' });
    assert.deepEqual(filtered.data.map((item) => item.id), [product.id]);
    assert.equal(filtered.data[0].price, 123.45);
    const filters = await modules.catalog.filters(fixture.categories[0].slug, fixture.cities[0].slug);
    assert.ok(filters.attributes.length > 0);
    const ascending = fixture.products.slice(0, 4).map((item) => item.id);
    for (const sort of ['default', 'name_asc', 'name_desc', 'price_asc', 'price_desc', 'popularity_asc', 'popularity_desc', 'newest']) {
      const result = await modules.products.list({ ...base, sort });
      assert.equal(result.data.length, 4, sort);
      if (['name_asc', 'price_asc', 'popularity_desc'].includes(sort)) assert.deepEqual(result.data.map((item) => item.id), ascending, sort);
      if (['name_desc', 'price_desc', 'popularity_asc'].includes(sort)) assert.deepEqual(result.data.map((item) => item.id), [...ascending].reverse(), sort);
    }
    assert.deepEqual((await modules.products.list({ ...base, isNew: true })).data.map((item) => item.id), [product.id]);
    assert.deepEqual((await modules.products.list({ ...base, isSpecialOffer: true })).data.map((item) => item.id), [fixture.products[1].id]);
    // Read-only checks against the existing seeded Almaty catalog as well.
    assert.ok((await modules.products.list({ q: 'автомат', city: 'almaty' })).data.length > 0);
    assert.ok((await modules.products.list({ city: 'almaty', category: 'circuit-breakers', brand: 'schneider-electric', minPrice: 1000, maxPrice: 10000, attributes: 'rated_current:16,poles:1' })).data.length > 0);
  });
  await check('Product detail/specifications, localized names, city price/stock, related', async () => {
    const local = await modules.products.get(product.slug, fixture.cities[0].slug);
    const regional = await modules.products.get(product.slug, fixture.cities[1].slug);
    assert.equal(local.price, 123.45); assert.equal(regional.price, 130);
    assert.equal(local.availableQuantity, 12);
    assert.ok(local.technicalSpecifications.some((item) => item.key === 'rated_current' && Number(item.value) === 16));
    const availability = await modules.products.availability(product.id, fixture.cities[0].slug);
    assert.equal(availability.availableQuantity, 12);
    assert.ok((await modules.products.related(product.id, fixture.cities[0].slug)).length > 0);
    storage.set('selectedLanguage', 'ru');
    assert.match((await modules.products.get(product.slug)).name, /тестовый/);
    storage.set('selectedLanguage', 'kk');
  });
  await check('Guest cart persistent UUID, city UUID, add/update/remove/clear and stock rejection', async () => {
    const session = storage.get('sessionId');
    await modules.cart.setCity(fixture.cities[0].id);
    let cart = await modules.cart.addItem({ productId: product.id, quantity: 2, price: 1, stock: 999 });
    assert.equal(cart.totalItemCount, 2); assert.equal(cart.subtotal, 246.9);
    cart = await modules.cart.updateItem(cart.items[0].id, 3);
    assert.equal(cart.totalItemCount, 3);
    await assert.rejects(() => modules.cart.updateItem(cart.items[0].id, 999), (error) => error.response?.status === 409);
    cart = await modules.cart.removeItem(cart.items[0].id);
    assert.equal(cart.totalItemCount, 0);
    await modules.cart.clear();
    assert.equal((await modules.cart.get()).items.length, 0);
    assert.equal(storage.get('sessionId'), session);
  });
  await check('Guest comparison matrix, duplicate prevention, remove and 204 clear', async () => {
    await modules.comparison.add(product.id);
    await modules.comparison.add(product.id);
    await modules.comparison.add(fixture.products[1].id);
    const list = await modules.comparison.list(fixture.cities[0].slug);
    assert.equal(list.length, 2);
    assert.ok(list[0].technicalSpecifications.length > 0);
    await modules.comparison.remove(product.id);
    assert.equal((await modules.comparison.list()).length, 1);
    await modules.comparison.clear();
    assert.equal((await modules.comparison.list()).length, 0);
  });
  await check('Register/login exact JWT, auth restore and safe profile update', async () => {
    const registration = await modules.auth.register({ email: fixture.registrationEmail, password: fixture.password,
      firstName: 'Integration', lastName: 'Test', role: 'ADMIN' });
    assert.equal(registration.user.role, 'CUSTOMER');
    storage.set('authToken', registration.token);
    assert.equal((await modules.auth.me()).id, registration.user.id);
    assert.equal((await modules.users.me()).email, fixture.registrationEmail);
    assert.equal((await modules.users.update({ firstName: 'Updated', role: 'ADMIN' })).role, 'CUSTOMER');
    const session = await modules.auth.login({ email: fixture.users[0].email, password: fixture.password });
    storage.set('authToken', session.token);
    assert.equal((await modules.auth.me()).id, fixture.users[0].id);
  });
  await check('Authenticated favorites add/list/remove and 403 keeps JWT', async () => {
    await modules.favorites.add(product.id);
    assert.equal((await modules.favorites.list())[0].id, product.id);
    await modules.favorites.remove(product.id);
    assert.equal((await modules.favorites.list()).length, 0);
    const token = storage.get('authToken');
    await assert.rejects(() => api.get('/admin/products'), (error) => error.response?.status === 403);
    assert.equal(storage.get('authToken'), token);
  });
  await check('Authenticated checkout, server totals/reservations, cleared cart and owned order history/detail', async () => {
    await modules.cart.setCity(fixture.cities[0].id);
    await modules.cart.addItem({ productId: product.id, quantity: 2 });
    const before = await db.productStock.aggregate({ where: { productId: product.id }, _sum: { reserved: true } });
    const order = await modules.orders.create({ customerName: 'Integration Test', phone: '+70000000000',
      email: fixture.users[0].email, customerType: 'COMPANY', companyName: 'Demo Test', bin: '000000000000',
      deliveryMethod: 'DELIVERY', deliveryAddress: 'Demo test address', paymentMethod: 'BANK_TRANSFER', total: 1 });
    assert.equal(order.subtotal, 246.9); assert.equal(order.deliveryPrice, 25); assert.equal(order.total, 271.9);
    assert.equal((await modules.cart.get()).items.length, 0);
    assert.equal((await modules.orders.get(order.id)).id, order.id);
    assert.ok((await modules.orders.list()).some((item) => item.id === order.id));
    const after = await db.productStock.aggregate({ where: { productId: product.id }, _sum: { reserved: true } });
    assert.equal(after._sum.reserved - before._sum.reserved, 2);
  });
  await check('News pagination/detail, promotions, FAQ and all seven content pages', async () => {
    const articles = await modules.news.list({ page: 1, limit: 2 });
    assert.equal(articles.data.length, 2); assert.ok(articles.pagination.total >= 6);
    assert.equal((await modules.news.get(articles.data[0].slug)).id, articles.data[0].id);
    assert.ok((await modules.promotions.list()).length >= 4);
    assert.ok((await modules.faq.list()).length >= 5);
    for (const slug of ['delivery-and-payment', 'returns-and-exchange', 'how-to-order', 'online-payment', 'installment', 'privacy-policy', 'b2b']) {
      assert.equal((await modules.pages.get(slug)).slug, slug);
    }
  });
  await check('Customer request + one-click request use exact body without reserving stock', async () => {
    await modules.requests.create({ type: 'GENERAL', name: fixture.marker, phone: '+70000000000', email: fixture.registrationEmail, message: 'Integration fixture' });
    const before = await db.productStock.aggregate({ where: { productId: product.id }, _sum: { reserved: true } });
    await modules.orders.oneClick({ productId: product.id, cityId: fixture.cities[0].id, quantity: 1,
      customerName: fixture.marker, phone: '+70000000000', email: fixture.registrationEmail });
    const after = await db.productStock.aggregate({ where: { productId: product.id }, _sum: { reserved: true } });
    assert.equal(after._sum.reserved, before._sum.reserved);
  });
  await check('XLSX Blob, asset path resolution and null-safe query values', async () => {
    const blob = await modules.catalog.priceList(fixture.cities[0].slug);
    assert.ok(blob instanceof Blob);
    const bytes = Buffer.from(await blob.arrayBuffer());
    assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    const ExcelJS = backendRequire('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes); assert.equal(workbook.worksheets[0].getCell('A1').value, 'SKU');
    const { resolveAssetUrl } = await load('utils/assets.ts');
    assert.equal(resolveAssetUrl('/api/uploads/demo.png'), 'http://localhost:3000/api/uploads/demo.png');
    assert.equal(resolveAssetUrl(null), null); assert.equal(resolveAssetUrl('javascript:alert(1)'), null);
    assert.deepEqual(cleanQueryParams({ brand: undefined, city: 'null', q: '', inStock: false, page: 2 }), { inStock: false, page: 2 });
    await assert.rejects(() => modules.catalog.priceList('missing-integration-city'), (error) => {
      assert.equal(error.response?.status, 404);
      assert.equal(extractApiError(error), error.response.data.error.message);
      return true;
    });
  });
  await check('Actual upload URL resolves to a readable PNG on the backend origin', async () => {
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhXcAAAAASUVORK5CYII=', 'base64');
    const form = new FormData();
    form.append('file', new Blob([pixel], { type: 'image/png' }), 'integration-test.png');
    const upload = await fetch(`${api.defaults.baseURL}/admin/uploads`, {
      method: 'POST', headers: { Authorization: `Bearer ${fixture.tokens[2]}` }, body: form,
    });
    assert.equal(upload.status, 201);
    const { data } = await upload.json();
    assert.match(data.filename, /^[0-9a-f-]{36}\.png$/i);
    const target = path.resolve(root, 'backend/uploads', data.filename);
    assert.equal(path.dirname(target), path.resolve(root, 'backend/uploads'));
    uploadedTestFile = target;
    const { resolveAssetUrl } = await load('utils/assets.ts');
    const asset = await fetch(resolveAssetUrl(data.url));
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /image\/png/);
    assert.deepEqual(Buffer.from(await asset.arrayBuffer()), pixel);
  });
  await check('404 error extraction and expired JWT recovery back to guest', async () => {
    await assert.rejects(() => modules.products.get('missing-integration-product'), (error) => {
      assert.equal(error.response?.status, 404); assert.ok(!extractApiError(error).includes('AxiosError')); return true;
    });
    let invalidated = false;
    browser.addEventListener(AUTH_INVALIDATED_EVENT, () => { invalidated = true; });
    storage.set('authToken', 'expired.invalid.token');
    await assert.rejects(() => modules.auth.me());
    assert.equal(storage.has('authToken'), false); assert.equal(invalidated, true);
    assert.ok(await modules.cart.get());
  });
  await check('Client never sends price/stock/role authority or duplicate /api prefix', async () => {
    assert.ok(sentRequests.length > 30);
    for (const request of sentRequests) {
      assert.ok(!/^\/api(?:\/|$)/.test(request.url), `Duplicate API prefix: ${request.url}`);
      if (['/cart/items', '/orders', '/auth/register', '/users/me'].includes(request.url)) {
        for (const forbidden of ['price', 'unitPrice', 'lineTotal', 'subtotal', 'deliveryPrice', 'total', 'stock', 'role']) {
          assert.ok(!request.fields.includes(forbidden), `${request.url} must not send ${forbidden}`);
        }
      }
    }
  });
  console.log(`Integration passed: ${completed.length} real frontend-service flows; mocks=false.`);
} catch (error) {
  // Never print Axios config/headers (may contain a JWT).
  console.error('Integration failed:', error.response?.status || '', error.response?.data?.error?.message || error.message);
  process.exitCode = 1;
} finally {
  try {
    if (fixture) {
      try {
        await db.customerRequest.deleteMany({ where: { email: fixture.registrationEmail, name: fixture.marker } });
      } finally {
        await cleanupFixture(fixture);
      }
      console.log('Only this run\'s temporary fixtures were removed; seed data preserved.');
    }
  } catch (error) {
    console.error('Fixture cleanup failed:', error.code || 'database error'); process.exitCode = 1;
  } finally {
    try {
      if (uploadedTestFile) await unlink(uploadedTestFile);
    } finally {
      await db.$disconnect();
      if (vite) await vite.close();
    }
  }
}

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Real frontend TypeScript services + the running main backend. The in-memory
// browser has its own UUID and never reads or changes a user's browser storage.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backendRequire = createRequire(path.join(root, 'backend/package.json'));
backendRequire('dotenv').config({ path: path.join(root, 'backend/.env'), quiet: true });
const db = backendRequire('./src/config/prisma');
const { createFixture, cleanupFixture } = backendRequire('./tests/helpers/fixture');
const sessionId = randomUUID();
const storage = new Map([['sessionId', sessionId], ['selectedLanguage', 'kk']]);
const browser = new EventTarget();
browser.location = { origin: 'http://localhost:5173' };
browser.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
browser.setTimeout = setTimeout;
globalThis.window = browser;
let vite;
let fixture;
let stage = 'startup';
let completed = 0;
const check = async (name, operation) => {
  stage = name;
  await operation();
  completed += 1;
  console.log(`PASS ${name}`);
};

try {
  vite = await createServer({ root: path.join(root, 'frontend'), server: { middlewareMode: true }, appType: 'custom' });
  const load = (file) => vite.ssrLoadModule(`/src/${file}`);
  const { default: api } = await load('api/client.ts');
  const { assistantApi } = await load('api/assistant.api.ts');
  const { cartApi } = await load('api/cart.api.ts');
  const { healthApi } = await load('api/health.api.ts');
  const { useMocks } = await load('mocks/mock-api.ts');
  assert.equal(useMocks, false, 'Integration requires VITE_USE_MOCKS=false');
  assert.equal(api.defaults.baseURL, 'http://localhost:3000/api', 'Integration targets the main backend on port 3000');
  api.defaults.adapter = 'fetch';
  const requests = [];
  api.interceptors.response.use((response) => {
    const config = response.config;
    requests.push({
      url: config.url,
      sessionId: config.headers.get('X-Session-Id'),
      authorized: Boolean(config.headers.get('Authorization')),
      language: config.headers.get('Accept-Language'),
    });
    return response;
  });

  await check('Main backend health and assistant CORS preflight', async () => {
    assert.equal((await healthApi.get()).database, 'connected');
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
      const preflight = await fetch(`${api.defaults.baseURL}/assistant/chat`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type,x-session-id,accept-language',
        },
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
      const headers = preflight.headers.get('access-control-allow-headers')?.toLowerCase() || '';
      assert.ok(headers.includes('x-session-id'));
      assert.ok(headers.includes('authorization'));
    }
  });

  stage = 'create isolated database fixtures';
  fixture = await createFixture();
  const city = fixture.cities[0].slug;
  const product = fixture.products[0];
  storage.set('selectedCity', city);
  // These are metadata-only fixture links. No uploads or external downloads
  // occur; their exact preservation and safe backend-origin resolution is tested.
  const certificateUrl = `https://example.com/${fixture.marker}/certificate.pdf`;
  const manualPath = `/api/uploads/${fixture.marker}-manual.pdf`;
  await db.product.update({ where: { id: product.id }, data: { certificateUrl, manualUrl: manualPath } });
  const send = (input) => assistantApi.chat({ city, ...input });

  await check('Actual assistant search returns normalized database products and shared session', async () => {
    const result = await send({ message: product.sku });
    assert.equal(result.type, 'products');
    assert.equal(result.sessionId, sessionId);
    assert.equal(result.language, 'kk');
    assert.equal(result.city, city);
    assert.deepEqual(result.products.map((item) => item.id), [product.id]);
    assert.equal(result.products[0].price, 123.45);
    assert.equal(result.products[0].availableQuantity, 12);
    assert.ok(Array.isArray(result.products[0].images));
    assert.ok(Array.isArray(result.products[0].technicalSpecifications));
    assert.equal(Object.hasOwn(result.products[0], 'cityOffer'), false);
  });

  await check('Selected product details/specifications preserve authoritative price and stock', async () => {
    const result = await send({ message: 'Техникалық сипаттамасын көрсет', selectedProductId: product.id });
    assert.equal(result.type, 'product');
    assert.equal(result.product.id, product.id);
    assert.equal(result.product.price, 123.45);
    assert.equal(result.product.availableQuantity, 12);
    assert.ok(result.product.technicalSpecifications.some((item) => item.key === 'rated_current' && item.value === 16));
    assert.equal(result.product.certificateUrl, certificateUrl);
    assert.equal(result.product.manualUrl, `http://localhost:3000${manualPath}`);
  });

  await check('Certificate and manual response links are normalized safely', async () => {
    const result = await send({ message: 'Сертификатын көрсет', selectedProductId: product.id });
    assert.equal(result.type, 'certificates');
    assert.deepEqual(result.certificates, [{ url: certificateUrl, productId: product.id }]);
    assert.equal(result.manualUrl, `http://localhost:3000${manualPath}`);
  });

  let pending;
  await check('Adding request only proposes and does not create or modify a cart', async () => {
    assert.equal(await db.cart.count({ where: { sessionId } }), 0);
    assert.equal((await cartApi.get()).totalItemCount, 0);
    const result = await send({ message: '3 данасын себетке қос', selectedProductId: product.id });
    assert.equal(result.type, 'pending_action');
    pending = result.pendingAction;
    assert.equal(pending.requiresConfirmation, true);
    assert.equal(pending.productId, product.id);
    assert.equal(pending.quantity, 3);
    assert.equal(pending.city, city);
    assert.equal(pending.unitPrice, 123.45);
    assert.ok(Date.parse(pending.expiresAt) > Date.now());
    assert.equal(await db.cart.count({ where: { sessionId } }), 0);
    assert.equal((await cartApi.get()).totalItemCount, 0);
  });

  await check('Explicit confirmation adds once and ordinary frontend cart reads the same items', async () => {
    const result = await send({ message: 'Иә, қос', pendingActionId: pending.id });
    assert.equal(result.type, 'cart');
    assert.equal(result.confirmedActionId, pending.id);
    assert.equal(result.cartUrl, '/cart');
    assert.equal(result.checkoutUrl, '/checkout');
    assert.equal(result.cart.totalItemCount, 3);
    assert.equal(result.cart.items[0].quantity, 3);
    assert.equal(result.cart.items[0].unitPrice, 123.45);
    assert.equal(result.cart.subtotal, 370.35);
    const cart = await cartApi.get();
    assert.equal(cart.id, result.cart.id);
    assert.equal(cart.city.slug, city);
    assert.equal(cart.items[0].product.id, product.id);
    assert.equal(cart.items[0].quantity, 3);
  });

  await check('Replayed confirmation cannot increase cart quantity', async () => {
    const result = await send({ message: 'Иә, қос', pendingActionId: pending.id });
    assert.equal(result.type, 'message');
    assert.equal((await cartApi.get()).items[0].quantity, 3);
  });

  await check('Cancellation invalidates a new proposal without changing the cart', async () => {
    const next = await send({ message: '1 данасын себетке қос', selectedProductId: product.id });
    assert.equal(next.type, 'pending_action');
    assert.notEqual(next.pendingAction.id, pending.id);
    const cancelled = await send({ message: 'Жоқ, қоспа', pendingActionId: next.pendingAction.id });
    assert.equal(cancelled.type, 'message');
    const attempt = await send({ message: 'Иә, қос', pendingActionId: next.pendingAction.id });
    assert.equal(attempt.type, 'message');
    assert.equal((await cartApi.get()).totalItemCount, 3);
  });

  await check('Stock is unreserved and assistant/cart use only the same guest backend client', async () => {
    for (const original of fixture.stocks) {
      const current = await db.productStock.findUniqueOrThrow({ where: { id: original.id } });
      assert.equal(current.quantity, original.quantity);
      assert.equal(current.reserved, original.reserved);
    }
    const commerce = requests.filter((item) => ['/assistant/chat', '/cart'].includes(item.url));
    assert.ok(commerce.some((item) => item.url === '/assistant/chat'));
    assert.ok(commerce.some((item) => item.url === '/cart'));
    assert.ok(commerce.every((item) => item.sessionId === sessionId && !item.authorized && item.language === 'kk'));
    assert.equal(storage.get('sessionId'), sessionId);
  });

  console.log(`Assistant integration passed: ${completed} real frontend-to-backend checks; no user cart or seed data changed.`);
} catch (error) {
  // Axios/Prisma error objects can contain tokens, request bodies or credentials.
  // Print only the named test stage and safe status/code, never entire objects.
  console.error('Assistant integration failed:', stage, error.response?.status || error.code || error.name || 'error');
  process.exitCode = 1;
} finally {
  try {
    await db.assistantConversation.deleteMany({ where: { ownerKey: `guest:${sessionId}`, sessionId } });
    await db.cart.deleteMany({ where: { sessionId, userId: null } });
    if (fixture) await cleanupFixture(fixture);
    console.log('Removed only this run\'s UUID-owned conversation, pending actions, cart and disposable fixtures.');
  } catch (error) {
    console.error('Assistant fixture cleanup failed:', error.code || 'database error');
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
    if (vite) await vite.close();
  }
}

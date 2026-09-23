import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AxiosError } from 'axios';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createServer } from 'vite';

// Mount the real providers and run the real API services/interceptors. The
// adapter is the only fake: no backend, credentials, network, or database writes.
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173',
});
const previousGlobals = new Map();
for (const [name, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  Event: dom.window.Event, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
})) {
  previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
const previousMockMode = process.env.VITE_USE_MOCKS;
process.env.VITE_USE_MOCKS = 'false';
const completed = [];
const requests = [];
const unexpectedRequests = [];
let vite;
let reactRoot;
let snapshot;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function check(name, operation) {
  await operation();
  assert.deepEqual(unexpectedRequests, [], 'The context made an unhandled API request');
  completed.push(name);
  console.log(`PASS ${name}`);
}

async function settleUntil(condition, message) {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() >= deadline) {
      const errors = snapshot && [snapshot.auth.error, snapshot.city.error, snapshot.cart.error, snapshot.saved.error].filter(Boolean);
      assert.fail(`${message}; context errors: ${JSON.stringify(errors ?? [])}`);
    }
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  }
}

try {
  vite = await createServer({
    root: frontendRoot, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error',
  });
  const load = (file) => vite.ssrLoadModule(`/src/${file}`);
  const { default: api } = await load('api/client.ts');
  const { storageKeys, writeStorage } = await load('utils/storage.ts');
  const { AppProviders, useAuth, useCart, useCity, useSaved } = await load('contexts/AppContexts.tsx');
  const { createRoot } = await import('react-dom/client');
  const cities = [
    { id: randomUUID(), slug: 'almaty', name: 'Almaty' },
    { id: randomUUID(), slug: 'astana', name: 'Astana' },
  ];
  const category = { id: randomUUID(), slug: 'context-fixture', name: 'Context fixture' };
  const products = ['guest-item', 'private-item-a', 'private-item-b'].map((slug) => ({
    id: randomUUID(), sku: slug.toUpperCase(), slug, name: slug, brand: null, category,
    images: [], availableQuantity: 50, technicalSpecifications: [],
  }));
  const users = ['a', 'b'].map((suffix) => ({
    id: randomUUID(), email: `context-${suffix}@example.test`, firstName: `User ${suffix}`,
    lastName: null, phone: null, role: 'CUSTOMER', isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }));
  const tokens = ['fixture-token-a', 'fixture-token-b'];
  const carts = new Map();
  let authenticatedReadsGate;
  let staleUnauthorizedGate;

  function compactProduct(product) {
    return { id: product.id, sku: product.sku, slug: product.slug, name: product.name,
      unit: 'unit', brand: null, category: category.name, image: null };
  }

  function emptyCart() {
    return { id: null, city: null, items: [], subtotal: 0, totalItemCount: 0, warnings: [] };
  }

  function itemFor(product, quantity) {
    return { id: randomUUID(), product: compactProduct(product), quantity,
      unitPrice: 200, lineTotal: 200 * quantity, availableQuantity: 50,
      availabilityStatus: 'IN_STOCK', warning: null };
  }

  for (const [index, token] of tokens.entries()) {
    carts.set(token, { id: randomUUID(), city: cities[1], items: [itemFor(products[index + 1], index + 1)],
      subtotal: 200 * (index + 1), totalItemCount: index + 1, warnings: [] });
  }

  function response(config, data, status = 200) {
    return { config, data: structuredClone({ success: true, data }), status, statusText: String(status), headers: {} };
  }

  function rejectResponse(config, status) {
    const result = { config, status, statusText: String(status), headers: {},
      data: { success: false, error: { code: `FIXTURE_${status}`, message: `Fixture HTTP ${status}` } } };
    throw new AxiosError(`Fixture HTTP ${status}`, AxiosError.ERR_BAD_REQUEST, config, undefined, result);
  }

  api.defaults.adapter = async (config) => {
    const method = config.method.toUpperCase();
    const url = config.url;
    const token = config.headers.get('Authorization')?.replace(/^Bearer /, '');
    const userIndex = tokens.indexOf(token);
    const identity = userIndex >= 0 ? token : `guest:${config.headers.get('X-Session-Id')}`;
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    requests.push({ method, url, body, params: { ...config.params }, headers: config.headers.toJSON() });

    if (url === '/probe/stale-401') {
      assert.ok(staleUnauthorizedGate, 'The delayed response must be controlled by its test');
      await staleUnauthorizedGate.promise;
      return rejectResponse(config, 401);
    }
    if (url === '/probe/401') return rejectResponse(config, 401);
    if (url === '/probe/403') return rejectResponse(config, 403);
    if (url === '/health') return response(config, { status: 'OK', database: 'connected', timestamp: new Date().toISOString() });
    if (url === '/auth/login' && method === 'POST') {
      const index = users.findIndex((user) => user.email === body.email);
      if (index < 0) return rejectResponse(config, 401);
      return response(config, { user: users[index], token: tokens[index] });
    }
    if (url === '/auth/me') {
      if (userIndex < 0) return rejectResponse(config, 401);
      return response(config, users[userIndex]);
    }
    if (url === '/cities') return response(config, cities);
    if (authenticatedReadsGate && userIndex >= 0 && method === 'GET') await authenticatedReadsGate.promise;
    if (url === '/favorites' && method === 'GET') {
      if (userIndex < 0) return rejectResponse(config, 401);
      return response(config, [{ id: randomUUID(), createdAt: '2026-01-01T00:00:00.000Z', product: products[userIndex + 1] }]);
    }
    if (url === '/comparison' && method === 'GET') {
      const product = products[userIndex + 1]; // Guest index -1 resolves to the guest product.
      return response(config, { products: [product], attributes: [], count: 1, maximum: 4 });
    }
    if (url.startsWith('/products/') && method === 'GET') {
      const product = products.find((item) => item.slug === url.slice('/products/'.length));
      assert.ok(product, 'Saved lists must hydrate a known product detail');
      assert.ok(cities.some((city) => city.slug === config.params.city), 'Product details must use a city slug');
      return response(config, { ...product, cityOffer: {
        webPrice: config.params.city === 'astana' ? '200' : '100', storePrice: null, availabilityStatus: 'IN_STOCK',
      } });
    }
    if (url === '/cart' || url === '/cart/city' || url === '/cart/items') {
      if (!carts.has(identity)) carts.set(identity, emptyCart());
      const cart = carts.get(identity);
      if (url === '/cart' && method === 'GET') return response(config, cart);
      if (url === '/cart/city' && method === 'PATCH') {
        const city = cities.find((item) => item.id === body.cityId);
        assert.ok(city, 'Cart city must be an actual city UUID, never a slug');
        cart.id ??= randomUUID();
        cart.city = city;
        return response(config, cart);
      }
      if (url === '/cart/items' && method === 'POST') {
        assert.ok(cart.city, 'The city must be synchronized before adding an item');
        const product = products.find((item) => item.id === body.productId);
        assert.ok(product, 'Cart must send a known product UUID');
        assert.deepEqual(Object.keys(body).sort(), ['productId', 'quantity']);
        const item = cart.items.find((entry) => entry.product.id === body.productId);
        if (item) { item.quantity += body.quantity; item.lineTotal = item.unitPrice * item.quantity; }
        else cart.items.push(itemFor(product, body.quantity));
        cart.totalItemCount = cart.items.reduce((sum, entry) => sum + entry.quantity, 0);
        cart.subtotal = cart.items.reduce((sum, entry) => sum + entry.lineTotal, 0);
        return response(config, cart);
      }
    }
    unexpectedRequests.push(`${method} ${url}`);
    throw new Error(`Unhandled context fixture request: ${method} ${url}`);
  };

  function Probe() {
    snapshot = { auth: useAuth(), city: useCity(), cart: useCart(), saved: useSaved() };
    return React.createElement('output', { id: 'cart-count' }, String(snapshot.cart.cart?.totalItemCount ?? 0));
  }
  const ready = () => snapshot && !snapshot.auth.loading && !snapshot.city.loading && !snapshot.cart.loading && !snapshot.saved.loading;
  const count = () => document.getElementById('cart-count').textContent;
  const requestCount = (url) => requests.filter((request) => request.url === url).length;
  const login = (index) => snapshot.auth.login({ email: users[index].email, password: 'fixture-password' });
  const assertNoContextErrors = () => {
    assert.equal(snapshot.city.error, '');
    assert.equal(snapshot.cart.error, '');
    assert.equal(snapshot.saved.error, '');
  };

  await check('guest mount skips protected favorites and blocks a guest favorite mutation', async () => {
    reactRoot = createRoot(document.getElementById('root'));
    await act(async () => { reactRoot.render(React.createElement(AppProviders, null, React.createElement(Probe))); });
    await settleUntil(ready, 'Guest providers did not finish loading');
    assert.equal(snapshot.auth.user, null);
    assert.equal(snapshot.city.cities.length, 2);
    assert.equal(requestCount('/favorites'), 0);
    assert.equal(requestCount('/auth/me'), 0);
    assert.deepEqual(snapshot.saved.favorites, []);
    assert.equal(snapshot.saved.comparison[0].id, products[0].id);
    assert.equal(snapshot.saved.comparison[0].price, 100);
    assert.equal(count(), '0');
    const before = requests.length;
    await act(async () => { await assert.rejects(snapshot.saved.toggleFavorite(snapshot.saved.comparison[0])); });
    assert.equal(requests.length, before, 'A guest favorite action must not issue a protected API call');
    await act(async () => { await snapshot.saved.refresh(); });
    assertNoContextErrors();
  });

  await check('missing/empty tokens omit Authorization; guest UUID stays stable and queries are sanitized', async () => {
    const start = requests.length;
    for (const value of ['', '   ', '']) {
      writeStorage(storageKeys.token, value);
      await api.get('/health', { params: { absent: undefined, empty: '', literal: 'undefined', nullish: null, zero: 0, enabled: false } });
    }
    for (const request of requests.slice(start)) {
      assert.equal(request.headers.Authorization, undefined);
      assert.equal(request.headers['Accept-Language'], 'kk');
      assert.deepEqual(request.params, { zero: 0, enabled: false });
    }
    const sessions = new Set(requests.map((request) => request.headers['X-Session-Id']));
    assert.equal(sessions.size, 1);
    assert.match([...sessions][0], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(window.localStorage.getItem(storageKeys.session), [...sessions][0]);
  });

  await check('selected city slug becomes a cart city UUID before add, and the rendered count updates', async () => {
    await act(async () => { await snapshot.city.setCity('astana'); });
    await settleUntil(ready, 'City change did not finish loading');
    const start = requests.length;
    await act(async () => { await snapshot.cart.add(products[0].id, 2); });
    const mutations = requests.slice(start).filter((request) => ['PATCH', 'POST'].includes(request.method));
    assert.deepEqual(mutations.map((request) => request.url), ['/cart/city', '/cart/items']);
    assert.deepEqual(mutations[0].body, { cityId: cities[1].id });
    assert.equal(snapshot.city.city, 'astana');
    assert.equal(window.localStorage.getItem(storageKeys.city), 'astana');
    assert.equal(snapshot.cart.cart.city.id, cities[1].id);
    assert.equal(snapshot.saved.comparison[0].price, 200);
    assert.equal(snapshot.cart.cart.totalItemCount, 2);
    assert.equal(count(), '2', 'The mounted DOM must update without a page reload');
    assertNoContextErrors();
  });

  await check('rapid cart adds are serialized and preserve the latest count', async () => {
    const start = requests.length;
    await act(async () => { await Promise.all([snapshot.cart.add(products[0].id, 1), snapshot.cart.add(products[0].id, 1)]); });
    assert.deepEqual(requests.slice(start).map(({ method, url }) => `${method} ${url}`), [
      'GET /cart', 'POST /cart/items', 'GET /cart', 'POST /cart/items',
    ]);
    assert.equal(snapshot.cart.cart.totalItemCount, 4);
    assert.equal(count(), '4');
    assertNoContextErrors();
  });

  await check('login clears guest state immediately and reloads identity-scoped cart/favorites/comparison', async () => {
    authenticatedReadsGate = deferred();
    await act(async () => { await login(0); });
    assert.equal(snapshot.auth.user.id, users[0].id);
    assert.equal(snapshot.cart.cart, null, 'Previous identity cart must disappear while the new cart loads');
    assert.deepEqual(snapshot.saved.favorites, []);
    assert.deepEqual(snapshot.saved.comparison, [], 'Previous identity saved products must disappear while loading');
    authenticatedReadsGate.resolve();
    authenticatedReadsGate = undefined;
    await settleUntil(ready, 'Authenticated providers did not finish loading');
    assert.equal(window.localStorage.getItem(storageKeys.token), tokens[0]);
    assert.equal(count(), '1');
    assert.equal(snapshot.cart.cart.items[0].product.id, products[1].id);
    assert.deepEqual(snapshot.saved.favorites.map((product) => product.id), [products[1].id]);
    assert.deepEqual(snapshot.saved.comparison.map((product) => product.id), [products[1].id]);
    assert.ok(requests.some((request) => request.url === '/favorites' && request.headers.Authorization === `Bearer ${tokens[0]}`));
    assertNoContextErrors();
  });

  await check('403 and failed login 401 preserve an existing authenticated session', async () => {
    await assert.rejects(api.get('/probe/403'), (error) => error.response.status === 403);
    await assert.rejects(api.post('/auth/login', { email: 'unknown@example.test', password: 'invalid' }),
      (error) => error.response.status === 401);
    assert.equal(window.localStorage.getItem(storageKeys.token), tokens[0]);
    assert.equal(snapshot.auth.user.id, users[0].id);
    assert.equal(snapshot.saved.favorites[0].id, products[1].id);
  });

  await check('late 401 from the previous token cannot invalidate a newer login', async () => {
    staleUnauthorizedGate = deferred();
    // Attach rejection handling before releasing the adapter, avoiding unhandled rejections.
    const staleResult = api.get('/probe/stale-401').then(() => assert.fail('Expected fixture 401'), (error) => error);
    await settleUntil(() => requestCount('/probe/stale-401') === 1, 'The old-token request was not sent');
    await act(async () => { await login(1); });
    await settleUntil(ready, 'Second identity did not finish loading');
    assert.equal(snapshot.auth.user.id, users[1].id);
    staleUnauthorizedGate.resolve();
    const error = await staleResult;
    assert.equal(error.response.status, 401);
    assert.equal(window.localStorage.getItem(storageKeys.token), tokens[1]);
    assert.equal(snapshot.auth.user.id, users[1].id);
    assert.deepEqual(snapshot.saved.favorites.map((product) => product.id), [products[2].id]);
    assert.equal(count(), '2');
  });

  await check('current-token 401 clears auth/private lists and reloads guest state without favorites calls', async () => {
    const favoriteCalls = requestCount('/favorites');
    await act(async () => { await assert.rejects(api.get('/probe/401'), (error) => error.response.status === 401); });
    await settleUntil(ready, 'Guest state was not restored after session expiration');
    assert.equal(window.localStorage.getItem(storageKeys.token), null);
    assert.equal(snapshot.auth.user, null);
    assert.deepEqual(snapshot.saved.favorites, []);
    assert.deepEqual(snapshot.saved.comparison.map((product) => product.id), [products[0].id]);
    assert.equal(snapshot.cart.cart.items[0].product.id, products[0].id);
    assert.equal(count(), '4');
    assert.equal(requestCount('/favorites'), favoriteCalls, 'Logging out must not request protected favorites');
    assert.ok(snapshot.auth.error, 'Session expiration must be visible to the UI');
    assert.equal(new Set(requests.map((request) => request.headers['X-Session-Id'])).size, 1);
    assertNoContextErrors();
  });

  console.log(`\n${completed.length}/8 context/client regression checks passed (real React providers, isolated adapter).`);
} catch (error) {
  console.error(`\nContext/client regression failed after ${completed.length}/8 checks:`, error);
  process.exitCode = 1;
} finally {
  if (reactRoot) await act(async () => { reactRoot.unmount(); });
  if (vite) await vite.close();
  dom.window.close();
  for (const [name, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  if (previousMockMode === undefined) delete process.env.VITE_USE_MOCKS;
  else process.env.VITE_USE_MOCKS = previousMockMode;
}

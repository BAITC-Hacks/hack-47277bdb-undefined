import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import React, { act } from 'react';

// Component contract tests: render the real application and exercise its DOM.
// Only the HTTP transport is replaced; these tests never touch a database.
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'FormData']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
const { createRoot } = await import('react-dom/client');
const { AxiosError } = await import('axios');

const city = { id: '11111111-1111-4111-8111-111111111111', slug: 'almaty', name: 'Алматы' };
const astana = { ...city, id: '22222222-2222-4222-8222-222222222222', slug: 'astana', name: 'Астана' };
const category = { id: '33333333-3333-4333-8333-333333333333', slug: 'circuit-breakers', name: 'Автоматтар', parentId: null, children: [] };
const product = {
  id: '44444444-4444-4444-8444-444444444444', sku: 'UI-DEMO-16', slug: 'ui-demo-breaker', name: 'UI Demo C16',
  category, brand: { id: 'brand-id', slug: 'demo-brand', name: 'Demo Brand' }, unit: 'дана', image: null, images: [],
  cityOffer: { id: 'offer-id', webPrice: 4200, storePrice: 4400, availabilityStatus: 'IN_STOCK', deliveryEstimateHours: 24 },
  availableQuantity: 23, availabilityStatus: 'IN_STOCK', shortDescription: 'Demo item', description: 'Demo description',
  isNew: true, isSpecialOffer: true, isPopular: true,
  technicalSpecifications: [{ key: 'rated_current', name: 'Номинал ток', type: 'NUMBER', value: 16, unit: 'A' }],
};
const user = { id: '55555555-5555-4555-8555-555555555555', email: 'ui@example.test', firstName: 'UI', lastName: 'Tester', phone: '+70000000000', role: 'CUSTOMER', isActive: true };
const secondUser = { ...user, id: '77777777-7777-4777-8777-777777777777', email: 'second@example.test', firstName: 'Second', lastName: 'Buyer' };
const article = { id: 'article-id', slug: 'ui-news', title: 'API жаңалығы', content: 'API жаңалық мәтіні', excerpt: 'API қысқаша мәтін', publishedAt: '2026-09-23T10:00:00.000Z' };
const emptyCart = () => ({ id: null, city: null, items: [], subtotal: 0, totalItemCount: 0, warnings: [] });
const cartWithProduct = () => ({ id: 'cart-id', city, items: [{ id: 'item-id', product: { id: product.id, sku: product.sku, slug: product.slug, name: product.name, unit: 'дана', brand: 'Demo Brand', category: category.name, image: null }, quantity: 2, unitPrice: 4200, lineTotal: 8400, availableQuantity: 23, availabilityStatus: 'IN_STOCK', warning: null }], subtotal: 8400, totalItemCount: 2, warnings: [] });
let cart = emptyCart(); let calls = []; let createdOrder; let failProducts = false; let root; let vite; let orderGate;
const completed = [];
const pause = () => new Promise((resolve) => setTimeout(resolve, 10));
const body = () => dom.window.document.body.textContent || '';
const buttons = () => [...document.querySelectorAll('button')];
const response = (config, data, status = 200, pagination) => ({ config, status, statusText: String(status), headers: {}, data: status === 204 ? undefined : { success: true, data, ...(pagination ? { pagination } : {}) } });
const reject = (config, status, code, message) => Promise.reject(new AxiosError(message, 'ERR_BAD_RESPONSE', config, null, { config, status, statusText: String(status), headers: {}, data: { success: false, error: { code, message } } }));
const pagination = { page: 1, limit: 12, total: 25, totalPages: 3 };

async function adapter(config) {
  const method = config.method.toUpperCase(); const url = config.url; const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  calls.push({ method, url, payload, params: config.params, headers: config.headers });
  if (url === '/cities') return response(config, [city, astana]);
  if (url === '/categories' || url === '/categories/tree') return response(config, [category]);
  if (url === '/brands') return response(config, [product.brand]);
  if (url === '/cart' && method === 'GET') return response(config, structuredClone(cart));
  if (url === '/cart' && method === 'DELETE') { cart = emptyCart(); return response(config, null, 204); }
  if (url === '/cart/city') { cart = { ...cart, id: cart.id || 'cart-id', city: payload.cityId === astana.id ? astana : city }; return response(config, cart); }
  if (url === '/cart/items') { cart = cartWithProduct(); cart.items[0].quantity = payload.quantity; cart.totalItemCount = payload.quantity; cart.items[0].lineTotal = cart.subtotal = payload.quantity * 4200; return response(config, cart, 201); }
  if (url === '/comparison') return response(config, { products: [], attributes: [], count: 0, maximum: 4 });
  if (url === '/favorites') return response(config, []);
  if (url === '/products') {
    if (failProducts) return reject(config, 503, 'DATABASE_UNAVAILABLE', 'Demo server unavailable');
    return response(config, [product], 200, { ...pagination, page: Number(config.params.page || 1), limit: Number(config.params.limit || 12) });
  }
  if (url === '/products/missing') return reject(config, 404, 'PRODUCT_NOT_FOUND', 'Тауар табылмады');
  if (url === `/products/${product.slug}`) {
    const { unit, ...detail } = product; // Existing detail DTO does not include unit.
    return response(config, detail);
  }
  if (url === `/products/${product.id}/availability`) return response(config, { productId: product.id, sku: product.sku, city, offer: product.cityOffer, availableQuantity: 23, availabilityStatus: 'IN_STOCK', warehouses: [{ id: 'warehouse-id', name: 'API Demo Warehouse', code: 'DEMO', branchId: null, availableQuantity: 23 }] });
  if (url === `/products/${product.id}/related`) return response(config, []);
  if (url === `/catalog/categories/${category.slug}/filters`) return response(config, { category, city, brands: [product.brand], price: { min: 4200, max: 4400 }, attributes: [{ key: 'rated_current', name: 'Номинал ток', type: 'NUMBER', unit: 'A', possibleValues: [16, 25] }] });
  if (url === '/promotions') return response(config, [{ id: 'promo-id', title: 'API демо акция', description: 'API ұсыныс' }]);
  if (url === '/news') return response(config, [article], 200, { page: Number(config.params.page || 1), limit: Number(config.params.limit || 5), total: 6, totalPages: 2 });
  if (url === `/news/${article.slug}`) return response(config, article);
  if (url === '/faqs') return response(config, [{ id: 'faq-id', question: 'API сұрағы?', answer: 'API жауабы.' }]);
  if (url.startsWith('/pages/')) return response(config, { id: 'page-id', slug: url.split('/').at(-1), title: 'API ақпарат', content: 'API контент мәтіні' });
  if (url === '/branches') return response(config, [{ id: 'branch-id', cityId: city.id, name: 'API Demo Branch', address: null, phone1: null, phone2: null, email: null, workingHours: null, latitude: null, longitude: null, city }]);
  if (url === '/auth/me' || url === '/users/me' && method === 'GET') return response(config, config.headers.Authorization === 'Bearer second-ui-token' ? secondUser : user);
  if (url === '/auth/login' || url === '/auth/register') return response(config, { user, token: 'ui-contract-token' }, url === '/auth/register' ? 201 : 200);
  if (url === '/users/me' && method === 'PATCH') { Object.assign(user, payload); return response(config, user); }
  if (url === '/orders') {
    createdOrder = { id: '66666666-6666-4666-8666-666666666666', orderNumber: 'UI-ORDER-1', city, ...payload, companyName: payload.companyName || null, bin: payload.bin || null, deliveryAddress: payload.deliveryAddress || null, comment: payload.comment || null, subtotal: cart.subtotal, deliveryPrice: payload.deliveryMethod === 'DELIVERY' ? 1000 : 0, total: cart.subtotal + (payload.deliveryMethod === 'DELIVERY' ? 1000 : 0), status: 'NEW', paymentStatus: 'UNPAID', createdAt: '2026-09-23T10:00:00.000Z', updatedAt: '2026-09-23T10:00:00.000Z', items: [{ id: 'order-item', productId: product.id, productSlug: product.slug, productName: product.name, sku: product.sku, quantity: 2, unitPrice: 4200, lineTotal: 8400 }] };
    const result = response(config, structuredClone(createdOrder), 201);
    cart = emptyCart(); if (orderGate) await orderGate.promise;
    return result;
  }
  if (url === '/orders/me') return response(config, createdOrder ? [createdOrder] : []);
  if (url === `/orders/${createdOrder?.id}`) return response(config, createdOrder);
  if (url === '/one-click-orders' || url === '/requests') return response(config, { id: 'request-id', ...payload, status: 'NEW' }, 201);
  throw new Error(`Unhandled test API contract: ${method} ${url}`);
}

async function settle(predicate, message = 'render did not settle') {
  for (let count = 0; count < 120; count += 1) { await act(async () => { await pause(); }); if (predicate()) return; }
  throw new Error(`${message}: ${body().slice(-500)}`);
}
async function click(element) { assert.ok(element, 'element missing'); await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))); }
async function select(element, value) { assert.ok(element, 'select missing'); await act(async () => { element.value = value; element.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); }
function fill(name, value) { const element = document.querySelector(`[name="${name}"]`); assert.ok(element, `field ${name} missing`); element.value = value; }
async function submit(form) { assert.ok(form, 'form missing'); await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))); }
const check = async (name, action) => { await action(); completed.push(name); console.log(`PASS ${name}`); };

try {
  vite = await createServer({ root: frontendRoot, server: { middlewareMode: true, hmr: false }, appType: 'custom', ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module', 'import', 'development'] } } });
  const load = (file) => vite.ssrLoadModule(`/src/${file}`);
  const { default: api } = await load('api/client.ts'); api.defaults.adapter = adapter;
  const { MemoryRouter } = await vite.ssrLoadModule('react-router-dom');
  const { AppProviders } = await load('contexts/AppContexts.tsx'); const { default: App } = await load('App.tsx');
  const { useMocks } = await load('mocks/mock-api.ts'); assert.equal(useMocks, false);
  const mount = async (route, { authenticated = false, withCart = false } = {}) => {
    if (root) await act(async () => root.unmount());
    dom.window.localStorage.clear(); dom.window.localStorage.setItem('selectedCity', 'almaty');
    if (authenticated) dom.window.localStorage.setItem('authToken', 'ui-contract-token');
    cart = withCart ? cartWithProduct() : emptyCart(); calls = []; failProducts = false; orderGate = undefined;
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [route] }, React.createElement(AppProviders, null, React.createElement(App)))));
    await settle(() => calls.some((call) => call.url === '/comparison'));
  };

  await check('Homepage renders backend contract data without static mock inventory', async () => {
    await mount('/'); await settle(() => body().includes('API демо акция') && body().includes('UI Demo C16'));
    assert.ok(body().includes('API жаңалығы')); assert.ok(!body().includes('10 000-нан астам'));
  });
  await check('Catalog renders metadata, sends technical filters/sort/page and shows API errors', async () => {
    await mount('/catalog/circuit-breakers'); await settle(() => document.querySelector('[aria-label="Номинал ток"]'));
    await select(document.querySelector('[aria-label="Номинал ток"]'), '16');
    await settle(() => calls.some((call) => call.url === '/products' && call.params.attributes === 'rated_current:16'));
    await select(document.querySelector('#sort-products'), 'price_asc');
    await settle(() => calls.some((call) => call.url === '/products' && call.params.sort === 'price_asc'));
    await settle(() => buttons().some((button) => button.textContent === 'Келесі'));
    await click(buttons().find((button) => button.textContent === 'Келесі'));
    await settle(() => calls.some((call) => call.url === '/products' && call.params.page === 2));
    failProducts = true; await select(document.querySelector('#sort-products'), 'price_desc');
    await settle(() => body().includes('Demo server unavailable'));
    assert.ok(!body().includes('AxiosError'));
  });
  await check('Product details show specifications/warehouse and one-click sends exact body', async () => {
    await mount(`/product/${product.slug}`); await settle(() => body().includes('API Demo Warehouse'));
    assert.ok(body().includes('Номинал ток')); assert.ok(calls.some((call) => call.url.endsWith('/related')));
    await click(buttons().find((button) => button.textContent === '1 рет басу'));
    assert.ok(document.querySelector('dialog').textContent.includes('Саны: 1'));
    assert.ok(!document.querySelector('dialog').textContent.includes('дана'), 'Missing unit must not be guessed for cable products');
    fill('customerName', 'UI Customer'); fill('phone', '+70000000000');
    await submit(document.querySelector('dialog form')); await settle(() => body().includes('Өтінім қабылданды'));
    const request = calls.find((call) => call.url === '/one-click-orders'); assert.deepEqual(Object.keys(request.payload).sort(), ['cityId', 'customerName', 'phone', 'productId', 'quantity']);
    assert.equal(request.payload.cityId, city.id); assert.ok(!calls.some((call) => call.url === '/cart/items'));
  });
  await check('Missing product presents a 404 state rather than endless loading', async () => {
    await mount('/product/missing'); await settle(() => body().includes('Тауар табылмады'));
    assert.ok(document.querySelector('a[href="/catalog"]'));
  });
  await check('Login stores exact JWT and profile sends only allowed fields', async () => {
    await mount('/login'); await settle(() => document.querySelector('[name="password"]'));
    fill('email', user.email); fill('password', 'Demo-only-password'); await submit(document.querySelector('.auth-page form'));
    await settle(() => document.querySelector('.account-page form'));
    assert.equal(dom.window.localStorage.getItem('authToken'), 'ui-contract-token');
    fill('firstName', 'Updated UI'); await submit(document.querySelector('.account-page form'));
    await settle(() => calls.some((call) => call.url === '/users/me' && call.method === 'PATCH'));
    const request = calls.find((call) => call.url === '/users/me' && call.method === 'PATCH');
    assert.deepEqual(Object.keys(request.payload).sort(), ['firstName', 'lastName', 'phone']);
    assert.equal(request.payload.firstName, 'Updated UI');
  });
  await check('Checkout submits company/delivery enums, trusts server totals, refreshes cart without DELETE', async () => {
    await mount('/checkout', { authenticated: true, withCart: true }); await settle(() => document.querySelector('.checkout-form'));
    await click(document.querySelector('[name="customerType"][value="COMPANY"]'));
    await select(document.querySelector('[name="deliveryMethod"]'), 'DELIVERY');
    fill('customerName', 'UI Company Buyer'); fill('email', user.email); fill('phone', '+70000000000'); fill('companyName', 'UI Company'); fill('bin', '123456789012'); fill('deliveryAddress', 'Demo address');
    await submit(document.querySelector('.checkout-form')); await settle(() => body().includes('UI-ORDER-1'));
    const request = calls.find((call) => call.url === '/orders' && call.method === 'POST');
    assert.equal(request.payload.customerType, 'COMPANY'); assert.equal(request.payload.deliveryMethod, 'DELIVERY'); assert.equal(request.payload.companyName, 'UI Company');
    for (const forbidden of ['price', 'unitPrice', 'stock', 'subtotal', 'deliveryPrice', 'total']) assert.ok(!(forbidden in request.payload));
    assert.equal(createdOrder.total, 9400); assert.ok(!calls.some((call) => call.url === '/cart' && call.method === 'DELETE'));
    await settle(() => body().includes('0 тауар'));
  });
  await check('Order history and detail render the owned order response', async () => {
    await mount('/account/orders', { authenticated: true }); await settle(() => body().includes('UI-ORDER-1'));
    await click(document.querySelector(`a[href="/account/orders/${createdOrder.id}"]`));
    await settle(() => body().includes('UI Company Buyer') && body().includes(product.name));
  });
  for (const scenario of ['logout', 'account switch', 'late error', 'unmount']) {
    await check(`Checkout discards old identity response after ${scenario}`, async () => {
      await mount('/checkout', { authenticated: true, withCart: true });
      await settle(() => document.querySelector('.checkout-form'));
      const gate = {};
      gate.promise = new Promise((resolve, rejectGate) => { gate.resolve = resolve; gate.reject = rejectGate; });
      orderGate = gate;
      fill('customerName', 'Private Previous Buyer'); fill('email', user.email); fill('phone', '+70000000000');
      await submit(document.querySelector('.checkout-form'));
      await settle(() => calls.some((call) => call.url === '/orders'));
      if (scenario === 'unmount') {
        await click(document.querySelector('a.logo'));
        await settle(() => body().includes('API демо акция'));
      } else {
        // Simulate another tab logging out or changing the active account while
        // the original response is delayed; the new identity has its own cart.
        cart = cartWithProduct();
        const nextToken = scenario === 'logout' ? null : 'second-ui-token';
        await act(async () => {
          if (nextToken) window.localStorage.setItem('authToken', nextToken); else window.localStorage.removeItem('authToken');
          window.dispatchEvent(new dom.window.StorageEvent('storage', { key: 'authToken', oldValue: 'ui-contract-token', newValue: nextToken, storageArea: window.localStorage }));
        });
        await settle(() => document.querySelector('[name="customerName"]')?.value === (scenario === 'logout' ? '' : 'Second Buyer'));
      }
      const cartReads = calls.filter((call) => call.url === '/cart' && call.method === 'GET').length;
      await act(async () => { if (scenario === 'late error') gate.reject(new Error('PRIVATE_OLD_ORDER_FAILURE')); else gate.resolve(); await pause(); });
      orderGate = undefined;
      assert.equal(document.querySelector('.success'), null);
      assert.ok(!body().includes('UI-ORDER-1'));
      assert.ok(!body().includes('PRIVATE_OLD_ORDER_FAILURE'));
      assert.notEqual(document.querySelector('[name="customerName"]')?.value, 'Private Previous Buyer');
      assert.equal(calls.filter((call) => call.url === '/cart' && call.method === 'GET').length, cartReads, 'An old checkout must not refresh the new identity cart');
    });
  }
  await check('News, FAQ, content and contacts use real service-shaped responses', async () => {
    await mount('/news'); await settle(() => body().includes('API жаңалығы'));
    await click(document.querySelector('a[href="/news/ui-news"]')); await settle(() => body().includes('API жаңалық мәтіні'));
    await mount('/faq'); await settle(() => body().includes('API сұрағы?'));
    await mount('/delivery-and-payment'); await settle(() => body().includes('API контент мәтіні'));
    await mount('/contacts'); await settle(() => body().includes('API Demo Branch'));
    fill('name', 'UI Request'); fill('phone', '+70000000000'); await submit(document.querySelector('.request-form'));
    await settle(() => body().includes('Өтініміңіз қабылданды'));
    assert.ok(calls.some((call) => call.url === '/requests' && call.payload.type === 'GENERAL'));
    assert.ok(!body().includes('312-34-56'));
  });
  console.log(`Page checks passed: ${completed.length}; actual React pages + real API services, mocked HTTP transport only.`);
} catch (error) {
  console.error('Page checks failed:', error.message); process.exitCode = 1;
} finally {
  if (root) await act(async () => root.unmount());
  if (vite) await vite.close();
  dom.window.close();
}

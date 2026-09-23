import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { AxiosError } from 'axios';
import { createServer } from 'vite';

// Exercise the actual widget, providers, API service, and interceptors. Only
// Axios's transport is replaced: this suite never contacts a backend or cart.
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/' });
const previousGlobals = new Map();
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
  navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, FormData: dom.window.FormData,
  IS_REACT_ACT_ENVIRONMENT: true })) {
  previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const previousMockMode = process.env.VITE_USE_MOCKS;
process.env.VITE_USE_MOCKS = 'false';
const { createRoot } = await import('react-dom/client');
const cities = [
  { id: '11111111-1111-4111-8111-111111111111', slug: 'almaty', name: 'Алматы' },
  { id: '22222222-2222-4222-8222-222222222222', slug: 'astana', name: 'Астана' },
];
const category = { id: '33333333-3333-4333-8333-333333333333', slug: 'circuit-breakers', name: 'Автоматтар' };
const product = {
  id: '44444444-4444-4444-8444-444444444444', sku: 'ASSISTANT-UI-C16', slug: 'assistant-ui-c16', name: 'Assistant UI C16',
  category, brand: { id: 'brand-id', slug: 'demo-brand', name: 'Demo Brand' }, unit: 'дана', image: null, images: [],
  cityOffer: { id: 'offer-id', webPrice: '4200', storePrice: '4400', availabilityStatus: 'IN_STOCK', deliveryEstimateHours: 24 },
  availableQuantity: 23, availabilityStatus: 'IN_STOCK', isNew: false, isPopular: false, isSpecialOffer: false,
  certificateUrl: 'https://catalog.example.test/certificates/c16.pdf', manualUrl: null,
  technicalSpecifications: [{ key: 'rated_current', name: 'Номинал ток', type: 'NUMBER', value: '16', unit: 'A' }],
};
const users = [
  { id: '55555555-5555-4555-8555-555555555555', email: 'assistant-ui-a@example.test', firstName: 'First', lastName: 'Buyer', phone: null, role: 'CUSTOMER', isActive: true },
  { id: '66666666-6666-4666-8666-666666666666', email: 'assistant-ui-b@example.test', firstName: 'Second', lastName: 'Buyer', phone: null, role: 'CUSTOMER', isActive: true },
];
const tokens = ['assistant-fixture-a', 'assistant-fixture-b'];
const pendingId = '77777777-7777-4777-8777-777777777777';
const emptyCart = () => ({ id: null, city: null, items: [], subtotal: 0, totalItemCount: 0, warnings: [] });
const cartWithProduct = () => ({ id: 'cart-fixture', city: cities[0], subtotal: 4200, totalItemCount: 1, warnings: [],
  items: [{ id: 'item-fixture', product: { id: product.id, sku: product.sku, slug: product.slug, name: product.name,
    unit: product.unit, brand: 'Demo Brand', category: category.name, image: null }, quantity: 1, unitPrice: 4200,
  lineTotal: 4200, availableQuantity: 23, availabilityStatus: 'IN_STOCK', warning: null }] });
const pendingResponse = () => ({ type: 'pending_action', intent: 'ADD_TO_CART_INTENT',
  message: 'Assistant UI C16 — 1 данасын себетке қосайын ба?',
  pendingAction: { id: pendingId, type: 'ADD_TO_CART', productId: product.id, productName: product.name,
    quantity: 1, city: 'almaty', unitPrice: 4200, expiresAt: new Date(Date.now() + 900000).toISOString(), requiresConfirmation: true },
  quickReplies: ['Иә, қос', 'Жоқ, қоспа'] });
const productResponse = (extra = {}) => ({ type: 'product', message: 'Каталогтағы нақты тауар.', product, ...extra });
const cartResponse = (extra = {}) => ({ type: 'cart', message: 'Расталған тауар себетке қосылды.',
  confirmedActionId: pendingId, cart: cartWithProduct(), cartUrl: '/cart', checkoutUrl: '/checkout', ...extra });
const textResponse = (message) => ({ type: 'message', message });
const completed = [];
const unexpected = [];
let calls = []; let replies = []; let cart = emptyCart(); let root; let vite; let snapshot;
const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
const body = () => document.body.textContent || '';
const buttons = (scope = document) => [...scope.querySelectorAll('button')];
const button = (label, scope = document) => buttons(scope).find((item) => item.textContent.trim() === label);
const assistantCalls = () => calls.filter((call) => call.url === '/assistant/chat');
const cartReads = () => calls.filter((call) => call.url === '/cart' && call.method === 'GET').length;
const queue = (data, options = {}) => replies.push({ data, ...options });
const deferred = () => { let resolve; let reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const response = (config, data, status = 200) => ({ config, data: { success: true, data: structuredClone(data) }, status, statusText: String(status), headers: {} });

async function adapter(config) {
  const method = config.method.toUpperCase(); const url = config.url;
  const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  calls.push({ method, url, payload, headers: config.headers, params: config.params });
  if (url === '/cities') return response(config, cities);
  if (url === '/cart' && method === 'GET') return response(config, cart);
  if (url === '/cart/city') { cart = { ...cart, city: cities.find((city) => city.id === payload.cityId) }; return response(config, cart); }
  if (url === '/comparison') return response(config, { products: [], attributes: [], count: 0, maximum: 4 });
  if (url === '/favorites') return response(config, []);
  if (url === '/auth/me') return response(config, users[config.headers.get('Authorization') === `Bearer ${tokens[1]}` ? 1 : 0]);
  if (url === '/assistant/chat' && method === 'POST') {
    const next = replies.shift();
    if (!next) { unexpected.push(`${method} ${url} without a queued reply`); throw new Error('Unexpected assistant request'); }
    if (next.gate) await next.gate.promise;
    if (next.status) {
      const result = { config, status: next.status, statusText: String(next.status), headers: {},
        data: { success: false, error: { code: 'ASSISTANT_FIXTURE_ERROR', message: next.data.message } } };
      throw new AxiosError('Request failed', AxiosError.ERR_BAD_RESPONSE, config, undefined, result);
    }
    if (next.updateCart) cart = cartWithProduct();
    return response(config, { sessionId: payload.sessionId || config.headers.get('X-Session-Id'), language: 'kk',
      city: payload.city, mode: 'deterministic', intent: 'GENERAL_SUPPORT', ...next.data });
  }
  unexpected.push(`${method} ${url}`);
  throw new Error(`Unexpected API request: ${method} ${url}`);
}

async function settle(predicate, message = 'The assistant did not settle') {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail(`${message}. DOM: ${body().slice(-1200)}`);
    await act(async () => { await pause(); });
  }
}
async function click(element) {
  assert.ok(element, 'Expected button/link is missing');
  await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })));
}
async function fill(message) {
  const input = document.querySelector('.assistant-chat-form textarea[name="message"]');
  assert.ok(input, 'Assistant message textarea is missing');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(input, message);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}
async function submit(message, repeat = false) {
  await fill(message);
  const form = document.querySelector('.assistant-chat-form');
  await act(async () => {
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    if (repeat) form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });
}
async function idle() {
  await settle(() => !document.querySelector('.assistant-chat-form textarea')?.disabled, 'Assistant input remained disabled');
}
async function openChat() {
  if (!document.querySelector('.assistant-chat-form')) await click(document.querySelector('.assistant-chat-launcher'));
  await settle(() => document.querySelector('.assistant-chat-form'));
}
async function check(name, action) {
  await action();
  assert.deepEqual(unexpected, [], 'Only the expected main-backend contracts may be called');
  assert.ok(!calls.some((call) => /\/cart\/items/.test(call.url)), 'The widget must never bypass assistant confirmation via Cart API writes');
  assert.equal(replies.length, 0, 'A queued fixture response was not requested');
  completed.push(name); console.log(`PASS ${name}`);
}

try {
  vite = await createServer({ root: frontendRoot, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module', 'import', 'development'] } } });
  const load = (file) => vite.ssrLoadModule(`/src/${file}`);
  const { default: api } = await load('api/client.ts'); api.defaults.adapter = adapter;
  const { MemoryRouter } = await vite.ssrLoadModule('react-router-dom');
  const { AppProviders, useAuth, useCity, useCart } = await load('contexts/AppContexts.tsx');
  const { AssistantWidget } = await load('components/assistant/AssistantWidget.tsx');
  function Probe() { snapshot = { auth: useAuth(), city: useCity(), cart: useCart() }; return React.createElement(AssistantWidget); }
  async function mount({ authenticated = false, open = true } = {}) {
    if (root) await act(async () => root.unmount());
    window.localStorage.clear(); window.localStorage.setItem('selectedCity', 'almaty');
    if (authenticated) window.localStorage.setItem('authToken', tokens[0]);
    calls = []; replies = []; cart = emptyCart(); snapshot = undefined;
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(MemoryRouter, null,
      React.createElement(AppProviders, null, React.createElement(Probe)))));
    await settle(() => snapshot && !snapshot.auth.loading && !snapshot.city.loading && !snapshot.cart.loading);
    assert.equal(assistantCalls().length, 0, 'Rendering the widget must not send a chat message');
    if (open) { await click(document.querySelector('.assistant-chat-launcher')); await settle(() => document.querySelector('.assistant-chat-form')); }
  }
  async function search() {
    queue({ type: 'products', intent: 'PRODUCT_SEARCH', products: [product], message: 'Нақты каталогтағы іздеу нәтижесі.' });
    await click(button('16А автомат', document.querySelector('.assistant-chat-actions')));
    await settle(() => body().includes(product.name)); await idle();
  }
  async function propose() {
    await search(); queue(pendingResponse());
    await click(button('1 данасын қосу'));
    await settle(() => document.querySelector('.assistant-chat-pending')); await idle();
  }
  async function switchAccount(nextToken) {
    const oldValue = window.localStorage.getItem('authToken');
    await act(async () => {
      if (nextToken) window.localStorage.setItem('authToken', nextToken); else window.localStorage.removeItem('authToken');
      window.dispatchEvent(new dom.window.StorageEvent('storage', { key: 'authToken', oldValue, newValue: nextToken, storageArea: window.localStorage }));
    });
    await settle(() => !snapshot.auth.loading && (nextToken ? snapshot.auth.user?.id === users[1].id : !snapshot.auth.user));
    await settle(() => !snapshot.cart.loading); await act(async () => { await pause(); });
  }

  await check('Widget is closed by default and opening does not send an automatic request', async () => {
    await mount({ open: false });
    assert.equal(document.querySelector('.assistant-chat-form'), null);
    await click(document.querySelector('.assistant-chat-launcher'));
    await settle(() => document.querySelector('.assistant-chat-form'));
    assert.equal(assistantCalls().length, 0);
  });
  await check('Kazakh search uses shared session headers, main API endpoint and selected city slug', async () => {
    await mount(); await search();
    const request = assistantCalls()[0];
    assert.equal(request.method, 'POST'); assert.equal(request.payload.city, 'almaty');
    assert.match(request.payload.message, /16/);
    assert.equal(request.headers.get('Accept-Language'), 'kk');
    assert.match(request.headers.get('X-Session-Id'), /^[0-9a-f-]{36}$/i);
    if (request.payload.sessionId) assert.equal(request.payload.sessionId, request.headers.get('X-Session-Id'));
    assert.equal(request.headers.get('X-Session-Id'), window.localStorage.getItem('sessionId'));
    assert.equal(request.headers.get('Authorization'), undefined);
    assert.ok(body().replace(/\s/g, '').includes('4200'), 'The backend city price must be displayed');
    assert.ok(body().includes('23'), 'The backend stock must be displayed');
    assert.ok(document.querySelector(`a[href="/product/${product.slug}"]`));
  });
  await check('Selection, specifications, certificate and stock actions reuse conversation and exact product ID', async () => {
    await mount(); await search();
    queue(productResponse()); await click(button('Таңдау')); await settle(() => assistantCalls().length === 2); await idle();
    assert.equal(assistantCalls().at(-1).payload.selectedProductId, product.id);
    queue(productResponse({ message: 'Номинал ток: 16 A' }));
    await click(button('Сипаттамалар')); await settle(() => body().includes('Номинал ток: 16 A')); await idle();
    queue(productResponse({ type: 'certificates', message: 'Каталогтағы сертификат сілтемесі қоса берілді.',
      certificates: [{ productId: product.id, url: product.certificateUrl }] }));
    await click(button('Сертификат')); await settle(() => body().includes('Каталогтағы сертификат')); await idle();
    assert.ok(document.querySelector(`a[href="${product.certificateUrl}"]`));
    queue(productResponse({ type: 'stock', message: 'Қаладағы нақты қалдық: 23.', availability: {
      productId: product.id, sku: product.sku, city: cities[0], offer: product.cityOffer, availableQuantity: 23,
      availabilityStatus: 'IN_STOCK', warehouses: [{ id: 'warehouse-id', name: 'UI Алматы қоймасы', code: 'ALM', availableQuantity: 23 }] } }));
    await click(button('Қалдық')); await settle(() => body().includes('Қаладағы нақты қалдық: 23.')); await idle();
    for (const request of assistantCalls().slice(1)) {
      assert.equal(request.payload.selectedProductId, product.id);
      assert.equal(request.headers.get('X-Session-Id'), assistantCalls()[0].headers.get('X-Session-Id'));
    }
  });
  await check('Add action only proposes; explicit confirmation sends pending ID and refreshes shared cart', async () => {
    await mount(); await propose();
    const proposal = assistantCalls().at(-1);
    assert.equal(proposal.payload.selectedProductId, product.id); assert.equal(proposal.payload.quantity, 1);
    assert.equal(snapshot.cart.cart.totalItemCount, 0);
    const before = cartReads(); queue(cartResponse(), { updateCart: true });
    await click(button('Иә, қос', document.querySelector('.assistant-chat-pending')));
    await settle(() => snapshot.cart.cart?.totalItemCount === 1); await idle();
    const confirmation = assistantCalls().at(-1);
    assert.equal(confirmation.payload.message, 'Иә, қос'); assert.equal(confirmation.payload.pendingActionId, pendingId);
    assert.ok(cartReads() > before, 'Cart badge and checkout must receive the refreshed server cart');
    assert.equal(document.querySelector('.assistant-chat-pending'), null);
    assert.ok(document.querySelector('a[href="/cart"]')); assert.ok(document.querySelector('a[href="/checkout"]'));
    assert.equal(assistantCalls().length, 3, 'Confirmation must be sent exactly once');
  });
  await check('Explicit cancellation sends the pending ID without changing the cart', async () => {
    await mount(); await propose();
    queue(textResponse('Қосу тоқтатылды. Себет өзгерген жоқ.'));
    await click(button('Жоқ, қоспа', document.querySelector('.assistant-chat-pending')));
    await settle(() => body().includes('Қосу тоқтатылды.')); await idle();
    assert.equal(assistantCalls().at(-1).payload.pendingActionId, pendingId);
    assert.equal(assistantCalls().at(-1).payload.message, 'Жоқ, қоспа');
    assert.equal(snapshot.cart.cart.totalItemCount, 0); assert.equal(document.querySelector('.assistant-chat-pending'), null);
  });
  await check('Typed explicit confirmation binds the currently displayed proposal ID', async () => {
    await mount(); await propose(); queue(cartResponse(), { updateCart: true });
    await submit('Иә, қос'); await settle(() => snapshot.cart.cart?.totalItemCount === 1); await idle();
    assert.equal(assistantCalls().at(-1).payload.pendingActionId, pendingId);
    assert.equal(assistantCalls().at(-1).payload.message, 'Иә, қос');
    assert.equal(assistantCalls().length, 3);
  });
  await check('Confirmation without a visible local proposal never reaches the backend', async () => {
    await mount(); await submit('Иә, қос');
    await settle(() => document.querySelector('.assistant-chat-error'));
    assert.equal(assistantCalls().length, 0); assert.equal(snapshot.cart.cart.totalItemCount, 0);
  });
  await check('Expired pending proposals cannot be confirmed by a button or typed message', async () => {
    await mount(); await search(); const expired = pendingResponse();
    expired.pendingAction.expiresAt = new Date(Date.now() - 60000).toISOString(); queue(expired);
    await click(button('1 данасын қосу')); await settle(() => document.querySelector('.assistant-chat-pending')); await idle();
    const confirm = button('Иә, қос', document.querySelector('.assistant-chat-pending'));
    assert.ok(confirm.disabled); await click(confirm); assert.equal(assistantCalls().length, 2);
    await submit('Иә, қос'); await settle(() => document.querySelector('.assistant-chat-error'));
    assert.equal(assistantCalls().length, 2); assert.equal(document.querySelector('.assistant-chat-pending'), null);
  });
  await check('Close and reopen preserve the current proposal without sending or adding anything', async () => {
    await mount(); await propose();
    await click(document.querySelector('.assistant-chat-header button'));
    assert.equal(document.querySelector('.assistant-chat-form'), null);
    await openChat(); assert.ok(document.querySelector('.assistant-chat-pending'));
    assert.equal(assistantCalls().length, 2); assert.equal(snapshot.cart.cart.totalItemCount, 0);
  });
  await check('Manual messages, delivery and cart shortcuts call the assistant rather than a separate AI backend', async () => {
    await mount(); queue(textResponse('Мәтін қабылданды.')); await submit('Маған 16А автомат керек');
    await settle(() => body().includes('Мәтін қабылданды.')); await idle();
    assert.equal(assistantCalls()[0].payload.message, 'Маған 16А автомат керек');
    queue({ type: 'knowledge', message: 'Жеткізу ережелері негізгі backend-тен.' });
    await click(button('Жеткізу', document.querySelector('.assistant-chat-actions')));
    await settle(() => body().includes('Жеткізу ережелері негізгі backend-тен.')); await idle();
    queue({ type: 'cart', message: 'Ағымдағы себет.', cart: emptyCart(), cartUrl: '/cart', checkoutUrl: '/checkout' });
    await click(button('Себет', document.querySelector('.assistant-chat-actions')));
    await settle(() => body().includes('Ағымдағы себет.')); await idle();
    assert.equal(assistantCalls().length, 3);
    assert.ok(assistantCalls().every((request) => request.headers.get('X-Session-Id') === assistantCalls()[0].headers.get('X-Session-Id')));
  });
  await check('Server errors are readable and the form can retry without a stale confirmation', async () => {
    await mount(); queue(textResponse('Assistant fixture temporarily unavailable'), { status: 503 });
    await submit('Тауар іздеу'); await settle(() => body().includes('Assistant fixture temporarily unavailable')); await idle();
    assert.equal(document.querySelector('.assistant-chat-pending'), null); assert.ok(!body().includes('AxiosError'));
    queue(textResponse('Қайта сұрау сәтті.')); await submit('Қайта іздеу');
    await settle(() => body().includes('Қайта сұрау сәтті.')); await idle();
    assert.equal(assistantCalls().length, 2);
  });
  await check('A failed new request clears the old proposal instead of allowing an unrelated later confirmation', async () => {
    await mount(); await propose(); queue(textResponse('Нақты сұрау орындалмады.'), { status: 422 });
    await submit('Басқа тауар ізде'); await settle(() => body().includes('Нақты сұрау орындалмады.')); await idle();
    assert.equal(document.querySelector('.assistant-chat-pending'), null);
    await submit('Иә, қос'); await settle(() => document.querySelector('.assistant-chat-error'));
    assert.equal(assistantCalls().length, 3); assert.equal(snapshot.cart.cart.totalItemCount, 0);
  });
  await check('Rapid double submit sends only one assistant request', async () => {
    await mount(); const gate = deferred(); queue(textResponse('Жалғыз жауап.'), { gate });
    await submit('Бір рет жіберу', true); await settle(() => assistantCalls().length > 0);
    assert.equal(assistantCalls().length, 1);
    assert.ok(document.querySelector('.assistant-chat-form button[type="submit"]')?.disabled);
    await act(async () => gate.resolve()); await settle(() => body().includes('Жалғыз жауап.')); await idle();
  });
  await check('City change hides pending confirmation and sends the new city on subsequent requests', async () => {
    await mount(); await propose();
    await act(async () => snapshot.city.setCity('astana'));
    await settle(() => snapshot.city.city === 'astana' && !document.querySelector('.assistant-chat-pending'));
    await openChat();
    queue(textResponse('Астана бойынша жауап.')); await submit('Қалдық бар ма?');
    await settle(() => body().includes('Астана бойынша жауап.')); await idle();
    assert.equal(assistantCalls().at(-1).payload.city, 'astana');
    assert.equal(assistantCalls().at(-1).payload.pendingActionId, undefined);
  });
  await check('A delayed previous-city reply cannot restore a stale proposal', async () => {
    await mount(); const gate = deferred(); queue({ ...pendingResponse(), message: 'PRIVATE_OLD_CITY_PROPOSAL' }, { gate });
    await submit('1 данасын себетке қос'); await settle(() => assistantCalls().length === 1);
    await act(async () => snapshot.city.setCity('astana'));
    await settle(() => snapshot.city.city === 'astana');
    await act(async () => { gate.resolve(); await pause(); });
    await openChat();
    await idle(); assert.ok(!body().includes('PRIVATE_OLD_CITY_PROPOSAL'));
    assert.equal(document.querySelector('.assistant-chat-pending'), null);
  });
  await check('Authenticated assistant shares JWT; account changes clear old pending actions', async () => {
    await mount({ authenticated: true }); await propose();
    assert.equal(assistantCalls()[0].headers.get('Authorization'), `Bearer ${tokens[0]}`);
    await switchAccount(tokens[1]);
    await settle(() => !document.querySelector('.assistant-chat-pending'));
    await openChat();
    queue(textResponse('Жаңа аккаунт жауабы.')); await submit('Сәлем');
    await settle(() => body().includes('Жаңа аккаунт жауабы.')); await idle();
    assert.equal(assistantCalls().at(-1).headers.get('Authorization'), `Bearer ${tokens[1]}`);
  });
  for (const scenario of ['account switch', 'logout', 'late error']) {
    await check(`Delayed old-identity response is ignored after ${scenario}`, async () => {
      await mount({ authenticated: true }); await propose();
      const gate = deferred(); queue(cartResponse({ message: 'PRIVATE_OLD_IDENTITY_RESULT' }), { gate });
      await click(button('Иә, қос', document.querySelector('.assistant-chat-pending')));
      await settle(() => assistantCalls().length === 3);
      await switchAccount(scenario === 'logout' ? null : tokens[1]);
      const reads = cartReads();
      await act(async () => { if (scenario === 'late error') gate.reject(new Error('PRIVATE_OLD_IDENTITY_ERROR')); else gate.resolve(); await pause(); });
      await openChat();
      await idle(); assert.ok(!body().includes('PRIVATE_OLD_IDENTITY_RESULT')); assert.ok(!body().includes('PRIVATE_OLD_IDENTITY_ERROR'));
      assert.equal(document.querySelector('.assistant-chat-pending'), null);
      assert.equal(cartReads(), reads, 'Old conversation responses must not refresh the new identity cart');
    });
  }
  await check('Untrusted assistant text is rendered as text and unsafe certificate links are not clickable', async () => {
    await mount(); const maliciousText = '<img src=x onerror="window.__assistantInjected=true">';
    queue(productResponse({ type: 'certificates', message: maliciousText,
      product: { ...product, certificateUrl: 'javascript:alert(1)', manualUrl: 'data:text/html,<script>alert(1)</script>' },
      certificates: [{ productId: product.id, url: 'javascript:alert(2)' }], manualUrl: 'javascript:alert(3)' }));
    await submit('Сертификат көрсет'); await settle(() => body().includes(maliciousText)); await idle();
    assert.equal(document.querySelector('img[onerror]'), null); assert.equal(window.__assistantInjected, undefined);
    assert.ok(![...document.querySelectorAll('a[href]')].some((link) => /^(?:javascript|data):/i.test(link.getAttribute('href'))));
    assert.ok(![...document.querySelectorAll('img[src]')].some((image) => /^(?:javascript|data):/i.test(image.getAttribute('src'))));
  });
  await check('Unavailable products display backend alternatives and compatibility explanations', async () => {
    await mount(); queue(productResponse({ message: 'Бұл тауар қалада жоқ.',
      product: { ...product, cityOffer: null, availableQuantity: 0, availabilityStatus: 'OUT_OF_STOCK' },
      alternatives: [{ product: { ...product, id: '88888888-8888-4888-8888-888888888888', slug: 'assistant-alternative', name: 'API Alternative C16' },
        reasons: ['Номинал тогы бірдей: 16 A.'], differences: ['Өндіруші басқа.'], warnings: ['Үйлесімділікті маманмен тексеріңіз.'] }],
      alternativeWarning: 'Каталогта расталған балама.' }));
    await submit('Баламасын көрсет'); await settle(() => body().includes('API Alternative C16')); await idle();
    assert.ok(body().includes('Номинал тогы бірдей: 16 A.')); assert.ok(body().includes('Өндіруші басқа.'));
    assert.ok(body().includes('Үйлесімділікті маманмен тексеріңіз.'));
    assert.ok(document.querySelector('a[href="/product/assistant-alternative"]'));
  });
  console.log(`Assistant UI checks passed: ${completed.length}; real React widget/providers/API client, transport fixtures only.`);
} catch (error) {
  console.error('Assistant UI checks failed:', error.stack || error.message); process.exitCode = 1;
} finally {
  if (root) await act(async () => root.unmount());
  if (vite) await vite.close();
  dom.window.close();
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
  if (previousMockMode === undefined) delete process.env.VITE_USE_MOCKS; else process.env.VITE_USE_MOCKS = previousMockMode;
}

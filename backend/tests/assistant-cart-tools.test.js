const { randomUUID } = require('crypto');
const prisma = require('../src/config/prisma');
const serializable = require('../src/utils/transaction');
const cartService = require('../src/modules/cart/cart.service');
const cartTools = require('../src/modules/assistant/tools/cart.tools');
const { createFixture, resetCommerce, cleanupFixture } = require('./helpers/fixture');

let fixture;
let identity;
const proposalInput = (overrides = {}) => ({
  identity, productId: fixture.products[0].id, quantity: 2,
  city: fixture.cities[0].slug, language: 'kk', ...overrides,
});
const confirm = (pending, owner = identity) => serializable((tx) =>
  cartTools.confirm({ identity: owner, pending, language: 'kk' }, tx));
const cart = () => cartService.getCart(identity, 'kk');
const add = (quantity, product = fixture.products[0]) => serializable((tx) =>
  cartService.addItemInTransaction(identity, { productId: product.id, quantity }, 'kk', tx, { cityId: fixture.cities[0].id }));

beforeAll(async () => { fixture = await createFixture(); });
beforeEach(async () => {
  await resetCommerce(fixture);
  identity = { userId: null, sessionId: randomUUID() };
});
afterAll(async () => {
  try { await cleanupFixture(fixture); } finally { await prisma.$disconnect(); }
});

describe('assistant cart tools reuse the main cart business logic', () => {
  test('preparing an authoritative city quote creates no cart or reservation', async () => {
    const beforeStocks = await prisma.productStock.findMany({ where: { productId: fixture.products[0].id } });
    const pending = await cartTools.prepare(proposalInput({ unitPrice: 0.01, stock: 100000 }));
    expect(pending).toEqual({
      productId: fixture.products[0].id, quantity: 2, cityId: fixture.cities[0].id,
      citySlug: fixture.cities[0].slug, unitPrice: 123.45, productName: fixture.products[0].nameKk,
      cartFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect((await cart()).id).toBeNull();
    expect(await prisma.cart.count({ where: { sessionId: identity.sessionId } })).toBe(0);
    expect(await prisma.productStock.findMany({ where: { productId: fixture.products[0].id } })).toEqual(beforeStocks);
  });

  test('language changes presentation but not the cart fingerprint', async () => {
    await add(1);
    const kk = await cartTools.prepare(proposalInput());
    const ru = await cartTools.prepare(proposalInput({ language: 'ru' }));
    expect(ru.productName).toBe(fixture.products[0].nameRu);
    expect(ru.cartFingerprint).toBe(kk.cartFingerprint);
  });

  test('preparing for an existing cart leaves its quantity unchanged', async () => {
    await add(3);
    const pending = await cartTools.prepare(proposalInput({ quantity: 4 }));
    expect(pending.quantity).toBe(4);
    expect((await cart()).totalItemCount).toBe(3);
  });

  test('prepare checks accumulated quantity, not just the increment', async () => {
    await add(10);
    await expect(cartTools.prepare(proposalInput({ quantity: 3 }))).rejects.toMatchObject({
      statusCode: 409, code: 'INSUFFICIENT_STOCK', details: { requested: 13, available: 12 },
    });
    expect((await cart()).totalItemCount).toBe(10);
  });

  test.each([0, -1, false, 1.5, 10001])('invalid proposed increment %p is rejected without side effects', async (quantity) => {
    await expect(cartTools.prepare(proposalInput({ quantity }))).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_QUANTITY' });
    expect((await cart()).id).toBeNull();
  });

  test('preparation requires an explicit city and does not assume Almaty', async () => {
    await expect(cartTools.prepare(proposalInput({ city: undefined }))).rejects.toMatchObject({ statusCode: 422, code: 'CITY_REQUIRED' });
    expect((await cart()).id).toBeNull();
  });

  test('an inactive product cannot be proposed', async () => {
    await expect(cartTools.prepare(proposalInput({ productId: fixture.products[4].id, quantity: 1 })))
      .rejects.toMatchObject({ statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
    expect((await cart()).id).toBeNull();
  });

  test('prepare and tx cart helper reject another city without hidden repricing', async () => {
    await add(1);
    await expect(cartTools.prepare(proposalInput({ city: fixture.cities[1].slug })))
      .rejects.toMatchObject({ statusCode: 409, code: 'CART_CITY_MISMATCH' });
    await expect(serializable((tx) => cartService.addItemInTransaction(identity,
      { productId: fixture.products[0].id, quantity: 1 }, 'kk', tx, { cityId: fixture.cities[1].id })))
      .rejects.toMatchObject({ statusCode: 409, code: 'CART_CITY_MISMATCH' });
    const unchanged = await cart();
    expect(unchanged.city.id).toBe(fixture.cities[0].id);
    expect(unchanged.totalItemCount).toBe(1);
    expect(unchanged.items[0].unitPrice).toBe(123.45);
  });

  test('confirmation creates a first cart in the explicitly proposed city', async () => {
    const pending = await cartTools.prepare(proposalInput({ city: fixture.cities[1].slug }));
    const result = await confirm(pending);
    expect(result.city.id).toBe(fixture.cities[1].id);
    expect(result.totalItemCount).toBe(2);
    expect(result.items[0].unitPrice).toBe(130);
    expect(result.subtotal).toBe(260);
  });

  test('confirmation adds the increment and never reserves stock', async () => {
    await add(3);
    const pending = await cartTools.prepare(proposalInput({ quantity: 4 }));
    const result = await confirm(pending);
    expect(result.totalItemCount).toBe(7);
    expect(result.subtotal).toBe(864.15);
    for (const initial of fixture.stocks) {
      expect(await prisma.productStock.findUnique({ where: { id: initial.id } }))
        .toMatchObject({ quantity: initial.quantity, reserved: initial.reserved });
    }
  });

  test('confirmation is owner-neutral internally and works with the main authenticated cart identity', async () => {
    const owner = { userId: fixture.users[0].id, sessionId: null };
    const pending = await cartTools.prepare(proposalInput({ identity: owner }));
    const result = await confirm(pending, owner);
    expect(result.totalItemCount).toBe(2);
    expect(await prisma.cart.findUnique({ where: { id: result.id } }))
      .toMatchObject({ userId: fixture.users[0].id, sessionId: null });
    expect((await cart()).id).toBeNull();
  });

  test('changed cart quantity invalidates confirmation without adding again', async () => {
    await add(1);
    const pending = await cartTools.prepare(proposalInput());
    await add(1);
    await expect(confirm(pending)).rejects.toMatchObject({ statusCode: 409, code: 'CART_CHANGED' });
    expect((await cart()).totalItemCount).toBe(2);
  });

  test('a changed price on the proposed product requires fresh confirmation', async () => {
    await add(1);
    const pending = await cartTools.prepare(proposalInput());
    await prisma.productOffer.update({ where: { id: fixture.offers[0].id }, data: { webPrice: '124.45' } });
    await expect(confirm(pending)).rejects.toMatchObject({ statusCode: 409, code: 'PRICE_CHANGED' });
    expect((await cart()).totalItemCount).toBe(1);
  });

  test('a changed price on another cart line invalidates the cart snapshot', async () => {
    await add(1, fixture.products[1]);
    const pending = await cartTools.prepare(proposalInput());
    const otherOffer = fixture.offers.find((offer) => offer.productId === fixture.products[1].id && offer.cityId === fixture.cities[0].id);
    await prisma.productOffer.update({ where: { id: otherOffer.id }, data: { webPrice: '201.00' } });
    await expect(confirm(pending)).rejects.toMatchObject({ statusCode: 409, code: 'CART_CHANGED' });
    expect((await cart()).totalItemCount).toBe(1);
  });

  test('a stock reduction after prepare is checked again on confirmation', async () => {
    const pending = await cartTools.prepare(proposalInput());
    for (const stock of fixture.stocks.filter((item) => item.productId === fixture.products[0].id)) {
      await prisma.productStock.update({ where: { id: stock.id }, data: { quantity: stock.reserved } });
    }
    await expect(confirm(pending)).rejects.toMatchObject({ statusCode: 409, code: 'INSUFFICIENT_STOCK' });
    expect((await cart()).id).toBeNull();
  });

  test('a cart city change after prepare rejects confirmation', async () => {
    await add(1);
    const pending = await cartTools.prepare(proposalInput());
    await cartService.changeCity(identity, fixture.cities[1].id, 'kk');
    await expect(confirm(pending)).rejects.toMatchObject({ statusCode: 409, code: 'CART_CITY_MISMATCH' });
    expect((await cart()).totalItemCount).toBe(1);
    expect((await cart()).city.id).toBe(fixture.cities[1].id);
  });

  test('new inactive city is rejected at confirmation without creating a cart', async () => {
    const pending = await cartTools.prepare(proposalInput());
    try {
      await prisma.city.update({ where: { id: fixture.cities[0].id }, data: { isActive: false } });
      await expect(confirm(pending)).rejects.toMatchObject({ statusCode: 409, code: 'CITY_INACTIVE' });
      expect((await cart()).id).toBeNull();
    } finally {
      await prisma.city.update({ where: { id: fixture.cities[0].id }, data: { isActive: true } });
    }
  });

  test('outer transaction failure rolls back confirmed cart creation and all items', async () => {
    const pending = await cartTools.prepare(proposalInput());
    const failure = new Error('Simulated action-persistence failure');
    await expect(serializable(async (tx) => {
      await cartTools.confirm({ identity, pending, language: 'kk' }, tx);
      throw failure;
    })).rejects.toBe(failure);
    expect((await cart()).id).toBeNull();
    expect((await confirm(pending)).totalItemCount).toBe(2);
  });

  test('forgetting a transaction never falls back to a standalone Prisma write', async () => {
    const pending = await cartTools.prepare(proposalInput());
    await expect(cartTools.confirm({ identity, pending, language: 'kk' })).rejects.toThrow(TypeError);
    await expect(cartService.addItemInTransaction(identity,
      { productId: fixture.products[0].id, quantity: 1 }, 'kk', undefined, { cityId: fixture.cities[0].id }))
      .rejects.toThrow(TypeError);
    expect((await cart()).id).toBeNull();
  });

  test('tx helper rejects negative increments rather than lowering an existing quantity', async () => {
    await add(3);
    await expect(add(-1)).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_QUANTITY' });
    expect((await cart()).totalItemCount).toBe(3);
  });

  test('concurrent use of the same snapshot cannot silently overwrite a committed cart change', async () => {
    await cartService.changeCity(identity, fixture.cities[0].id, 'kk');
    const pending = await cartTools.prepare(proposalInput());
    const results = await Promise.allSettled([confirm(pending), confirm(pending)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected').reason)
      .toMatchObject({ statusCode: 409, code: 'CART_CHANGED' });
    expect((await cart()).totalItemCount).toBe(2);
  });
});

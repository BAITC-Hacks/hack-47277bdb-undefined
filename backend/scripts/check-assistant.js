const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const env = require('../src/config/env');
const prisma = require('../src/config/prisma');
const { createFixture, cleanupFixture } = require('../tests/helpers/fixture');

// The server must already be running against the SAME DATABASE_URL. No seeded
// commerce rows are changed. Only this run's UUID-owned fixtures are removed.
const base = `http://127.0.0.1:${env.port}/api`;
const sessionId = randomUUID();
let fixture;
const call = async (path, body) => {
  const response = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  assert.equal(response.status, 200, data.error?.code || path);
  return data.data;
};

(async () => {
  try {
    assert.equal((await call('/health')).database, 'connected');
    const search = await call('/assistant/chat', { message: 'Маған 16А автомат керек', city: 'almaty' });
    assert.equal(search.language, 'kk');
    assert.ok(search.products.length > 0);
    assert.ok(search.products.every((item) => item.cityOffer && Number.isFinite(item.cityOffer.webPrice)));
    fixture = await createFixture();
    const proposal = await call('/assistant/chat', { message: '3 данасын себетке қос', city: fixture.cities[0].slug, selectedProductId: fixture.products[0].id });
    assert.equal(proposal.type, 'pending_action');
    assert.equal((await call('/cart')).totalItemCount, 0);
    const confirmed = await call('/assistant/chat', { message: 'Иә, қос', pendingActionId: proposal.pendingAction.id });
    assert.equal(confirmed.cart.totalItemCount, 3);
    assert.equal(confirmed.cartUrl, '/cart');
    assert.equal(confirmed.checkoutUrl, '/checkout');
    await call('/assistant/chat', { message: 'Иә, қос', pendingActionId: proposal.pendingAction.id });
    assert.equal((await call('/cart')).totalItemCount, 3);
    assert.equal((await prisma.productStock.findUnique({ where: { id: fixture.stocks[0].id } })).reserved, fixture.stocks[0].reserved);
    console.log('Assistant HTTP smoke passed: health200, real Kazakh catalog, read-only proposal, explicit confirmation, replay-safe cart, unchanged reservations.');
  } catch (error) {
    console.error('Assistant smoke failed:', error.code || error.message);
    process.exitCode = 1;
  } finally {
    try {
      await prisma.assistantConversation.deleteMany({ where: { ownerKey: `guest:${sessionId}`, sessionId } });
      if (fixture) await cleanupFixture(fixture);
    } finally { await prisma.$disconnect(); }
  }
})();

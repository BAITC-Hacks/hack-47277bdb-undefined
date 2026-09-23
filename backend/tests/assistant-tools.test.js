const prisma = require('../src/config/prisma');
const { createFixture, cleanupFixture } = require('./helpers/fixture');
const productTools = require('../src/modules/assistant/tools/product.tools');
const purchaseTools = require('../src/modules/assistant/tools/purchase.tools');

describe('Assistant tools: typed conversational criteria', () => {
  test('understands glued Kazakh current, without forwarding filler text', () => {
    const criteria = productTools.parseSearchQuery('Маған16А автомат керек', [{ slug: 'circuit-breakers', name: 'Автоматтар' }]);
    expect(criteria).toMatchObject({ category: 'circuit-breakers', attributes: { rated_current: 16 }, terms: [] });
  });

  test('understands decimal cable section and Russian filler', () => {
    const criteria = productTools.parseSearchQuery('Нужен кабель 3х2,5', [{ slug: 'power-cables', name: 'Кабель' }]);
    expect(criteria).toMatchObject({ category: 'power-cables', attributes: { cores: 3, cross_section: 2.5 }, terms: [] });
  });

  test('extracts model curve/poles and does not mistake leakage mA for amperes', () => {
    expect(productTools.parseSearchQuery('автомат C16 2P').attributes).toEqual({ rated_current: 16, characteristic_curve: 'C', poles: 2 });
    expect(productTools.parseSearchQuery('УЗО 30мА').attributes).not.toHaveProperty('rated_current');
  });

  test('UUID segments cannot overwrite an explicit amp rating or invent a curve', () => {
    const marker = 'jest-abcd1234-c364-4abc-8abc-123456abcdef';
    expect(productTools.parseSearchQuery(`Маған16А ${marker} керек`).attributes).toEqual({ rated_current: 16 });
    expect(productTools.parseSearchQuery(marker).attributes).toEqual({});
    expect(productTools.parseSearchQuery('16A jest-16a-c25-2p-3x25').attributes).toEqual({ rated_current: 16 });
  });

  test.each(['DEMO-SE-EASY9-C16-1P', 'AB16A', 'C16XYZ', 'C16.model', 'SKU_25A_C364_2P', 'ABC3x25'])('%s remains an opaque identifier, not a measurement', (identifier) => {
    expect(productTools.parseSearchQuery(identifier).attributes).toEqual({});
  });

  test('explicit amperes take precedence and standalone punctuated ratings still work', () => {
    expect(productTools.parseSearchQuery('16А C25').attributes).toEqual({ rated_current: 16, characteristic_curve: 'C' });
    expect(productTools.parseSearchQuery('автомат C16.').attributes).toEqual({ rated_current: 16, characteristic_curve: 'C' });
    expect(productTools.parseSearchQuery('автомат 16.5А, 2P').attributes).toEqual({ rated_current: 16.5, poles: 2 });
  });

  test('rejects contradictory or missing candidate characteristics', () => {
    const spec = (value) => [{ key: 'rated_current', name: 'Ток', value }];
    expect(productTools.compareSpecifications(spec(16), spec(25), 'circuit-breakers').matches).toBe(false);
    expect(productTools.compareSpecifications(spec(16), [], 'circuit-breakers').matches).toBe(false);
    const result = productTools.compareSpecifications(spec(16), spec(16), 'circuit-breakers');
    expect(result.matches).toBe(true);
    expect(result.missing).toContain('poles');
    expect(result).not.toHaveProperty('compatible');
  });

  test('invalid delivery input is rejected before database operations', async () => {
    await expect(purchaseTools.estimateDelivery({ subtotal: -1 })).rejects.toMatchObject({ code: 'INVALID_SUBTOTAL' });
    await expect(purchaseTools.estimateDelivery({ subtotal: NaN })).rejects.toMatchObject({ code: 'INVALID_SUBTOTAL' });
    await expect(purchaseTools.estimateDelivery({ subtotal: 0, deliveryMethod: 'TELEPORT' })).rejects.toMatchObject({ code: 'INVALID_DELIVERY_METHOD' });
    expect(() => purchaseTools.identifyTopics('', 'invented')).toThrow('Unknown purchase information topic.');
  });
});

describe('Assistant tools: real service-backed PostgreSQL data', () => {
  let fixture;
  const faqIds = [];
  beforeAll(async () => { fixture = await createFixture(); });
  afterAll(async () => {
    try {
      if (faqIds.length) await prisma.faq.deleteMany({ where: { id: { in: faqIds } } });
      await cleanupFixture(fixture);
    } finally { await prisma.$disconnect(); }
  });

  test('selected product ID returns current regional detail, stock, unit and nullable documents', async () => {
    const a = await productTools.getProduct({ productId: fixture.products[0].id, citySlug: fixture.cities[0].slug, language: 'kk' });
    const b = await productTools.getProduct({ productId: fixture.products[0].id, citySlug: fixture.cities[1].slug, language: 'ru' });
    expect(a).toMatchObject({ id: fixture.products[0].id, unit: 'дана', availableQuantity: 12, cityOffer: { webPrice: 123.45 }, certificateUrl: null, manualUrl: null });
    expect(b).toMatchObject({ id: a.id, availableQuantity: 6, cityOffer: { webPrice: 130 } });
    expect(a.technicalSpecifications).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'rated_current', value: 16 })]));
  });

  test('inconsistent references and inactive products are never silently resolved', async () => {
    await expect(productTools.getProduct({ productId: fixture.products[0].id, sku: fixture.products[1].sku, citySlug: fixture.cities[0].slug })).rejects.toMatchObject({ code: 'CONFLICTING_PRODUCT_REFERENCE' });
    await expect(productTools.getProduct({ productId: fixture.products[4].id, citySlug: fixture.cities[0].slug })).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });

  test('search combines real typed attributes and meaningful tokens', async () => {
    const result = await productTools.searchProducts({ query: `Маған 16А ${fixture.marker} керек`, citySlug: fixture.cities[0].slug });
    expect(result.criteria.attributes).toEqual({ rated_current: 16 });
    expect(result.products.map(({ id }) => id)).toContain(fixture.products[0].id);
    expect(result.products.map(({ id }) => id)).not.toContain(fixture.products[1].id);
    expect(result.products.find(({ id }) => id === fixture.products[0].id).cityOffer.webPrice).toBe(123.45);
    expect(result.city.slug).toBe(fixture.cities[0].slug);
  });

  test('an unrelated query is not replaced with arbitrary popular products', async () => {
    const result = await productTools.searchProducts({ query: `unfindable-${fixture.marker}-zzzzzzzz`, citySlug: fixture.cities[0].slug });
    expect(result.products).toEqual([]);
  });

  test('related uses existing service and excludes source/inactive products', async () => {
    const result = await productTools.relatedProducts({ productId: fixture.products[0].id, citySlug: fixture.cities[0].slug });
    expect(result.products.map(({ id }) => id)).toEqual([fixture.products[1].id]);
  });

  test('alternatives reject a different rated current without a compatibility assertion', async () => {
    const result = await productTools.findAlternatives({ productId: fixture.products[0].id, citySlug: fixture.cities[0].slug, language: 'ru' });
    expect(result.alternatives).toEqual([]);
    expect(result.warning).toContain('не гарантия');
  });

  test('matching catalog alternatives contain reasons, stock, prices and no guaranteed compatibility', async () => {
    await prisma.productAttributeValue.update({
      where: { productId_attributeDefinitionId: { productId: fixture.products[1].id, attributeDefinitionId: fixture.definition.id } },
      data: { numberValue: 16 },
    });
    const result = await productTools.findAlternatives({ productId: fixture.products[0].id, citySlug: fixture.cities[0].slug, quantity: 2 });
    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives[0]).toMatchObject({ product: { id: fixture.products[1].id, availableQuantity: 8, cityOffer: { webPrice: 200 } }, matchedAttributes: ['rated_current'] });
    expect(result.alternatives[0].reasons.length).toBeGreaterThan(1);
    expect(result.alternatives[0]).not.toHaveProperty('compatible');
    expect((await productTools.findAlternatives({ productId: fixture.products[0].id, citySlug: fixture.cities[0].slug, quantity: 100 })).alternatives).toEqual([]);
  });

  test('delivery estimates come from real current city rules including free threshold/pickup', async () => {
    const base = { citySlug: fixture.cities[0].slug };
    expect(await purchaseTools.estimateDelivery({ ...base, subtotal: 100 })).toMatchObject({ deliveryPrice: 25, deliveryMethod: 'DELIVERY' });
    expect(await purchaseTools.estimateDelivery({ ...base, subtotal: 500 })).toMatchObject({ deliveryPrice: 0 });
    expect(await purchaseTools.estimateDelivery({ ...base, subtotal: 100, deliveryMethod: 'PICKUP' })).toMatchObject({ deliveryPrice: 0, ruleId: null });
  });

  test('purchase information cites published live FAQ and never unpublished content', async () => {
    for (const isPublished of [true, false]) {
      const faq = await prisma.faq.create({ data: {
        questionKk: `${fixture.marker} сұрақ`, questionRu: `${fixture.marker} вопрос`,
        answerKk: isPublished ? 'Жарияланған нақты жауап.' : 'UNPUBLISHED-SECRET',
        answerRu: isPublished ? 'Настоящий опубликованный ответ.' : 'UNPUBLISHED-SECRET', isPublished,
      } });
      faqIds.push(faq.id);
    }
    const result = await purchaseTools.getPurchaseInformation({ query: fixture.marker, citySlug: fixture.cities[0].slug, language: 'ru' });
    expect(result.sources.map(({ id }) => id)).toContain(faqIds[0]);
    expect(result.sources.map(({ id }) => id)).not.toContain(faqIds[1]);
    expect(result.message).toContain('Настоящий опубликованный ответ.');
    expect(result.message).not.toContain('UNPUBLISHED-SECRET');
  });
});

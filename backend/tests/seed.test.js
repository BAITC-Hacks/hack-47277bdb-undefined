const {
  seedManifest, stableId, getDemoAvailability, getDemoStock, getDemoPrice,
  validateFixtures, seedDatabase, prepareAdmin,
} = require('../prisma/seed');
const { cities, brands, categories, attributeDefinitions, products } = require('../prisma/seed-data/catalog');
const { promotions, news, faqs, pages } = require('../prisma/seed-data/content');

describe('deterministic synthetic demo fixtures (no database connection)', () => {
  test('provide the requested catalog size with unique stable identifiers', () => {
    expect(validateFixtures).not.toThrow();
    expect(seedManifest).toMatchObject({
      products: 64, categories: 39, topLevelCategories: 12, subcategories: 27,
      cities: 9, brands: 7, branches: 9, warehouses: 12, offers: 576, stocks: 768,
      promotions: 4, news: 6, faqs: 5, contentPages: 7, deliveryRules: 9,
    });
    expect(new Set(seedManifest.productSkus).size).toBe(products.length);
    expect(new Set(seedManifest.productSlugs).size).toBe(products.length);
    expect(cities.map(({ slug }) => slug)).toEqual([
      'almaty', 'astana', 'shymkent', 'taraz', 'atyrau', 'aktau', 'karaganda', 'taldykorgan', 'oskemen',
    ]);
    expect(new Set(products.map(({ brand }) => brand))).toEqual(new Set(brands.map(({ slug }) => slug)));
  });

  test('build an acyclic hierarchy with products under every top-level category', () => {
    const categoriesBySlug = new Map(categories.map((category) => [category.slug, category]));
    const reachedRoots = new Set();
    for (const product of products) {
      let category = categoriesBySlug.get(product.category);
      const visited = new Set();
      while (category.parentSlug) {
        expect(visited.has(category.slug)).toBe(false);
        visited.add(category.slug);
        category = categoriesBySlug.get(category.parentSlug);
        expect(category).toBeDefined();
      }
      reachedRoots.add(category.slug);
    }
    expect(reachedRoots.size).toBe(12);
    expect(categories.filter(({ parentSlug }) => parentSlug === 'low-voltage').map(({ slug }) => slug)).toEqual([
      'circuit-breakers', 'power-breakers', 'rcd', 'rcbo', 'contactors', 'relays',
    ]);
  });

  test('use typed technical attributes with meaningful values for filtering', () => {
    const usedTypes = new Set();
    for (const product of products) {
      for (const [key, value] of Object.entries(product.attributes)) {
        const definition = attributeDefinitions[key];
        expect(definition).toBeDefined();
        usedTypes.add(definition.type);
        expect(typeof value).toBe(definition.type === 'NUMBER' ? 'number' : definition.type === 'BOOLEAN' ? 'boolean' : 'string');
      }
    }
    expect(usedTypes).toEqual(new Set(['NUMBER', 'SELECT', 'TEXT', 'BOOLEAN']));
    const breakers = products.filter(({ category }) => category === 'circuit-breakers');
    for (const product of breakers) {
      expect(Object.keys(product.attributes)).toEqual(expect.arrayContaining([
        'rated_current', 'poles', 'rated_voltage', 'breaking_capacity', 'characteristic_curve', 'ip_protection',
      ]));
    }
    expect(breakers.filter(({ attributes }) => attributes.rated_current === 16).length).toBeGreaterThan(1);
    expect(new Set(breakers.map(({ attributes }) => attributes.poles))).toEqual(new Set([1, 2, 3, 4]));
    expect(new Set(breakers.map(({ attributes }) => attributes.breaking_capacity))).toEqual(new Set([4.5, 6, 10]));
    const cableSections = new Set(products.filter(({ category }) => ['power-cables', 'flexible-wires'].includes(category)).map(({ attributes }) => attributes.cross_section));
    for (const section of [1.5, 2.5, 4, 6]) expect(cableSections.has(section)).toBe(true);
  });

  test('provide positive plausible regional prices, without random data on reruns', () => {
    for (const product of products) {
      const prices = cities.map((city) => getDemoPrice(product, city));
      expect(new Set(prices.map(({ webPrice }) => webPrice)).size).toBeGreaterThan(1);
      for (const [index, price] of prices.entries()) {
        expect(price).toEqual(getDemoPrice(product, cities[index]));
        expect(price.webPrice).toBeGreaterThan(0);
        expect(price.webPrice / product.basePrice).toBeGreaterThanOrEqual(0.95);
        expect(price.webPrice / product.basePrice).toBeLessThanOrEqual(1.08);
        expect(price.storePrice).toBeGreaterThanOrEqual(price.webPrice);
      }
    }
    const easy9 = products.find(({ sku }) => sku === 'DEMO-SE-EASY9-C16-1P');
    expect(getDemoPrice(easy9, cities[0]).webPrice).toBe(4200);
    expect(getDemoPrice(easy9, cities[1]).webPrice).toBe(4285);
  });

  test('keep every warehouse balance valid and align stock with all three availability statuses', () => {
    const seenStatuses = new Set();
    let reservedRows = 0;
    let checkedStockRows = 0;
    for (const [productIndex, product] of products.entries()) {
      for (const [cityIndex, city] of cities.entries()) {
        const status = getDemoAvailability(productIndex, cityIndex);
        seenStatuses.add(status);
        const warehouses = seedManifest.warehouseCodes.filter((code) => code.startsWith(`DEMO-${city.slug.toUpperCase()}-`));
        let cityAvailable = 0;
        for (let warehouseIndex = 0; warehouseIndex < warehouses.length; warehouseIndex += 1) {
          const stock = getDemoStock(product, productIndex, cityIndex, warehouseIndex);
          expect(stock).toEqual(getDemoStock(product, productIndex, cityIndex, warehouseIndex));
          expect(Number.isInteger(stock.quantity)).toBe(true);
          expect(Number.isInteger(stock.reserved)).toBe(true);
          expect(stock.reserved).toBeGreaterThanOrEqual(0);
          expect(stock.quantity).toBeGreaterThanOrEqual(stock.reserved);
          if (stock.reserved > 0) reservedRows += 1;
          cityAvailable += stock.quantity - stock.reserved;
          checkedStockRows += 1;
        }
        if (status === 'IN_STOCK') expect(cityAvailable).toBeGreaterThan(0);
        else expect(cityAvailable).toBe(0);
      }
    }
    expect(checkedStockRows).toBe(768);
    expect(reservedRows).toBeGreaterThan(0);
    expect(seenStatuses).toEqual(new Set(['IN_STOCK', 'ON_ORDER', 'OUT_OF_STOCK']));
    for (const city of ['ALMATY', 'ASTANA', 'KARAGANDA']) {
      expect(seedManifest.warehouseCodes.filter((code) => code.startsWith(`DEMO-${city}-`))).toHaveLength(2);
    }
  });

  test('retain bilingual demo labels and publish all required content pages', () => {
    for (const product of products) {
      expect(product.nameKk).toContain('(демо)');
      expect(product.nameRu).toContain('(демо)');
    }
    for (const entry of [...promotions, ...news, ...pages]) {
      expect(entry.titleKk.length).toBeGreaterThan(5);
      expect(entry.titleRu.length).toBeGreaterThan(5);
    }
    for (const faq of faqs) {
      for (const field of ['questionKk', 'questionRu', 'answerKk', 'answerRu']) expect(faq[field].length).toBeGreaterThan(10);
    }
    expect(pages.map(({ slug }) => slug)).toEqual([
      'delivery-and-payment', 'returns-and-exchange', 'how-to-order', 'online-payment', 'installment', 'privacy-policy', 'b2b',
    ]);
  });

  test('generate deterministic distinct UUIDs for models without natural unique keys', () => {
    const keys = cities.flatMap(({ slug }) => [`branch:${slug}`, `delivery:${slug}`]).concat(faqs.map(({ key }) => `faq:${key}`));
    const ids = keys.map(stableId);
    expect(new Set(ids).size).toBe(keys.length);
    for (const [index, id] of ids.entries()) {
      expect(id).toBe(stableId(keys[index]));
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    }
  });

  test('normalizes seeded admin emails exactly like login before lookup or creation', async () => {
    const { loginValidation } = require('../src/modules/auth/auth.validation');
    const email = ' Demo.Admin+hackathon@gmail.com ';
    const password = 'Synthetic-only-admin-password';
    const request = { body: { email, password } };
    for (const validation of loginValidation) await validation.run(request);
    const admin = await prepareAdmin({ SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: password }, { log: jest.fn() });
    expect(admin.email).toBe('demoadmin@gmail.com');
    expect(admin.email).toBe(request.body.email);
    expect(admin.password).not.toBe(password);
    expect(await require('bcryptjs').compare(password, admin.password)).toBe(true);
  });

  test.each([
    [{ SEED_ADMIN_EMAIL: 'not-an-email', SEED_ADMIN_PASSWORD: 'long-enough-demo-password' }, 'SEED_ADMIN_EMAIL'],
    [{ SEED_ADMIN_EMAIL: 'admin@example.test', SEED_ADMIN_PASSWORD: 'short' }, 'SEED_ADMIN_PASSWORD'],
    [{ SEED_ADMIN_EMAIL: 'admin@example.test', SEED_ADMIN_PASSWORD: 'қ'.repeat(40) }, 'SEED_ADMIN_PASSWORD'],
  ])('reject invalid admin configuration before opening a database transaction: %j', async (environment, errorField) => {
    const db = { $transaction: jest.fn() };
    await expect(seedDatabase(db, { environment, logger: { log: jest.fn() } })).rejects.toThrow(errorField);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

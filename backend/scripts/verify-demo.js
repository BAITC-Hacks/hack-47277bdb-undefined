const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const prisma = require('../src/config/prisma');
const { seedManifest } = require('../prisma/seed');

// Read-only validation. This never seeds, repairs, resets, or deletes records.
const readDemo = async (db = prisma) => {
  const [products, categories, cities, warehouses] = await Promise.all([
    db.product.findMany({
      where: { sku: { in: seedManifest.productSkus } }, orderBy: { sku: 'asc' },
      include: {
        offers: { orderBy: { id: 'asc' }, include: { city: true } },
        stocks: { orderBy: { id: 'asc' }, include: { warehouse: true } },
        attributeValues: { orderBy: { id: 'asc' }, include: { attributeDefinition: true } },
      },
    }),
    db.category.findMany({ where: { slug: { in: seedManifest.categorySlugs } }, orderBy: { slug: 'asc' } }),
    db.city.findMany({ where: { slug: { in: seedManifest.citySlugs } }, orderBy: { slug: 'asc' } }),
    db.warehouse.findMany({ where: { code: { in: seedManifest.warehouseCodes } }, orderBy: { code: 'asc' } }),
  ]);
  return { products, categories, cities, warehouses };
};

const snapshotDemo = async (db = prisma) =>
  createHash('sha256').update(JSON.stringify(await readDemo(db))).digest('hex');

const verifyDemo = async (db = prisma) => {
  const data = await readDemo(db);
  assert.equal(data.products.length, seedManifest.products, 'Run prisma:seed first');
  assert.equal(data.categories.length, seedManifest.categories);
  assert.equal(data.categories.filter((item) => !item.parentId).length, seedManifest.topLevelCategories);
  assert.equal(data.cities.length, seedManifest.cities);
  assert.equal(data.warehouses.length, seedManifest.warehouses);
  const categoryIds = new Set(data.categories.map(({ id }) => id));
  for (const category of data.categories) {
    if (category.parentId) assert.ok(categoryIds.has(category.parentId));
  }
  const statuses = new Set();
  let offerCount = 0;
  let stockCount = 0;
  let attributeCount = 0;
  let hasReservedStock = false;
  let hasZeroStock = false;
  for (const product of data.products) {
    const offers = product.offers.filter((item) => seedManifest.citySlugs.includes(item.city.slug));
    const stocks = product.stocks.filter((item) => seedManifest.warehouseCodes.includes(item.warehouse.code));
    assert.equal(offers.length, seedManifest.cities, `${product.sku}: missing city offer`);
    assert.equal(stocks.length, seedManifest.warehouses, `${product.sku}: missing warehouse stock`);
    assert.ok(new Set(offers.map((offer) => String(offer.webPrice))).size > 1, 'Regional price variation missing');
    offerCount += offers.length;
    stockCount += stocks.length;
    for (const offer of offers) statuses.add(offer.availabilityStatus);
    for (const stock of stocks) {
      assert.ok(stock.quantity >= 0 && stock.reserved >= 0 && stock.reserved <= stock.quantity);
      if (stock.quantity === 0) hasZeroStock = true;
      if (stock.reserved > 0) hasReservedStock = true;
    }
    assert.ok(product.attributeValues.length > 0, `${product.sku}: missing specifications`);
    for (const value of product.attributeValues) {
      const definition = value.attributeDefinition;
      assert.equal(definition.categoryId, product.categoryId);
      const valueKey = { NUMBER: 'numberValue', TEXT: 'textValue', SELECT: 'textValue', BOOLEAN: 'booleanValue' }[definition.type];
      assert.notEqual(value[valueKey], null, `${product.sku}: missing ${definition.key}`);
      attributeCount += 1;
    }
  }
  assert.deepEqual([...statuses].sort(), ['IN_STOCK', 'ON_ORDER', 'OUT_OF_STOCK']);
  assert.ok(hasReservedStock && hasZeroStock, 'Expected demo inventory variation');
  for (const flag of ['isNew', 'isSpecialOffer', 'isPopular']) {
    assert.ok(data.products.some((item) => item[flag]) && data.products.some((item) => !item[flag]));
  }
  return {
    products: data.products.length, categories: data.categories.length,
    topLevelCategories: seedManifest.topLevelCategories, subcategories: seedManifest.subcategories,
    cities: data.cities.length, warehouses: data.warehouses.length,
    offers: offerCount, stockRows: stockCount, attributeValues: attributeCount,
    statuses: [...statuses].sort(),
  };
};

if (require.main === module) {
  verifyDemo().then((result) => console.log('Demo verification passed:', result))
    .catch((error) => { console.error('Demo verification failed:', error.code || error.message); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}

module.exports = { verifyDemo, snapshotDemo };

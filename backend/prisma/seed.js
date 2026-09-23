'use strict';

const { createHash } = require('node:crypto');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { cities, brands, categories, attributeDefinitions, products } = require('./seed-data/catalog');
const { promotions, news, faqs, pages } = require('./seed-data/content');

const MULTI_WAREHOUSE_CITIES = new Set(['almaty', 'astana', 'karaganda']);
const DEMO_NOTICE_KK = 'Синтетикалық демо дерек. Нақты EKT қоры немесе расталған өндіруші сипаттамасы емес.';
const DEMO_NOTICE_RU = 'Синтетические демонстрационные данные. Не реальный склад EKT и не подтвержденная спецификация производителя.';

// A fixed UUID namespace keeps models without natural unique keys idempotent.
const UUID_NAMESPACE = Buffer.from('eb37b99d4d67411aa3c377bf78096e5b', 'hex');
const stableId = (key) => {
  const bytes = createHash('sha1').update(UUID_NAMESPACE).update(key, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const warehouseCodes = cities.flatMap((city) =>
  Array.from({ length: MULTI_WAREHOUSE_CITIES.has(city.slug) ? 2 : 1 }, (_, index) =>
    `DEMO-${city.slug.toUpperCase()}-${index + 1}`),
);

const seedManifest = Object.freeze({
  products: products.length,
  categories: categories.length,
  topLevelCategories: categories.filter((category) => !category.parentSlug).length,
  subcategories: categories.filter((category) => category.parentSlug).length,
  cities: cities.length,
  brands: brands.length,
  branches: cities.length,
  warehouses: warehouseCodes.length,
  offers: products.length * cities.length,
  stocks: products.length * warehouseCodes.length,
  promotions: promotions.length,
  news: news.length,
  faqs: faqs.length,
  contentPages: pages.length,
  deliveryRules: cities.length,
  productSkus: products.map((product) => product.sku),
  productSlugs: products.map((product) => product.slug),
  categorySlugs: categories.map((category) => category.slug),
  citySlugs: cities.map((city) => city.slug),
  warehouseCodes,
});

const getDemoAvailability = (productIndex, cityIndex) => {
  // Some devices are unavailable everywhere; others vary by city.
  if (productIndex % 19 === 17) return 'ON_ORDER';
  if (productIndex % 23 === 22) return 'OUT_OF_STOCK';
  const position = (productIndex + cityIndex * 3) % 11;
  if (position === 9) return 'ON_ORDER';
  if (position === 10) return 'OUT_OF_STOCK';
  return 'IN_STOCK';
};

const getDemoPrice = (product, city) => {
  const webPrice = Math.round((product.basePrice * (100 + city.pricePercent)) / 500) * 5;
  const storePrice = Math.round((webPrice * 1.04) / 5) * 5;
  return { webPrice, storePrice };
};

const getDemoStock = (product, productIndex, cityIndex, warehouseIndex) => {
  if (getDemoAvailability(productIndex, cityIndex) !== 'IN_STOCK') {
    return { quantity: 0, reserved: 0 };
  }
  const variation = (productIndex * 7 + cityIndex * 11 + warehouseIndex * 13) % 35;
  const quantity = product.unit === 'm'
    ? 150 + variation * 10
    : (warehouseIndex === 0 ? 12 : 4) + variation;
  // These small initial demo holds represent pre-existing manual reservations.
  // Reruns never change stock or reservations created by the order workflow.
  const reserved = productIndex % 8 === 0 && cityIndex < 3 && warehouseIndex === 0 ? 2 : 0;
  return { quantity, reserved };
};

const validateFixtures = () => {
  if (products.length < 50 || products.length > 80) throw new Error('Seed must contain 50–80 demo products.');
  for (const [label, values] of [
    ['product SKU', products.map((entry) => entry.sku)],
    ['product slug', products.map((entry) => entry.slug)],
    ['category slug', categories.map((entry) => entry.slug)],
  ]) {
    if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} in demo fixtures.`);
  }
  const categorySlugs = new Set(categories.map((entry) => entry.slug));
  const brandSlugs = new Set(brands.map((entry) => entry.slug));
  for (const product of products) {
    if (!categorySlugs.has(product.category) || !brandSlugs.has(product.brand)) {
      throw new Error(`Unknown category or brand for ${product.sku}.`);
    }
    if (!Number.isFinite(product.basePrice) || product.basePrice <= 0) throw new Error(`Invalid price for ${product.sku}.`);
    for (const [key, value] of Object.entries(product.attributes)) {
      const definition = attributeDefinitions[key];
      if (!definition) throw new Error(`Unknown attribute ${key} for ${product.sku}.`);
      const expectedType = definition.type === 'NUMBER' ? 'number' : definition.type === 'BOOLEAN' ? 'boolean' : 'string';
      if (typeof value !== expectedType || (expectedType === 'number' && !Number.isFinite(value))) {
        throw new Error(`Invalid typed value for ${product.sku}/${key}.`);
      }
    }
  }
};

const prepareAdmin = async (environment, logger) => {
  const inputEmail = environment.SEED_ADMIN_EMAIL;
  const password = environment.SEED_ADMIN_PASSWORD;
  if (!inputEmail || (typeof inputEmail === 'string' && !inputEmail.trim()) || !password) {
    logger.log('Admin skipped: set both SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create an administrator. No default password is used.');
    return null;
  }
  // Match the auth endpoints' provider-specific email canonicalization, including
  // Gmail dots and subaddresses, so a seeded account can log in normally.
  const request = { body: { email: inputEmail } };
  await body('email').isString().trim().isEmail().normalizeEmail().run(request);
  if (!validationResult(request).isEmpty()) {
    throw new Error('SEED_ADMIN_EMAIL must be a valid email address.');
  }
  const email = request.body.email;
  // bcrypt truncates after 72 UTF-8 bytes; reject instead of silently truncating.
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('SEED_ADMIN_PASSWORD must contain at least 12 characters and at most 72 UTF-8 bytes.');
  }
  return { email, password: await bcrypt.hash(password, 12) };
};

const seedCatalog = async (db) => {
  const cityRecords = new Map();
  const categoryRecords = new Map();
  const brandRecords = new Map();
  const warehouseRecords = new Map();
  const definitionRecords = new Map();

  // Every update is intentionally empty: demo reruns fill missing records,
  // preserve administrator edits, and never reset live inventory/reservations.
  for (const { pricePercent, ...city } of cities) {
    const record = await db.city.upsert({ where: { slug: city.slug }, update: {}, create: city });
    cityRecords.set(city.slug, record);
    const branchId = stableId(`branch:${city.slug}`);
    const branch = await db.branch.upsert({
      where: { id: branchId }, update: {},
      create: {
        id: branchId, cityId: record.id,
        nameKk: `${city.nameKk} демо филиалы`, nameRu: `Демо-филиал: ${city.nameRu}`,
        addressKk: null, addressRu: null, phone1: null, phone2: null, email: null,
        workingHoursKk: 'Демо: дүйсенбі–жұма 09:00–18:00',
        workingHoursRu: 'Демо: понедельник–пятница 09:00–18:00',
      },
    });
    if (branch.cityId !== record.id) {
      throw new Error(`Demo branch conflict for ${city.slug}: the existing branch belongs to another city. No data was overwritten.`);
    }
    const warehouses = [];
    const count = MULTI_WAREHOUSE_CITIES.has(city.slug) ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      const code = `DEMO-${city.slug.toUpperCase()}-${index + 1}`;
      const warehouse = await db.warehouse.upsert({
        where: { code }, update: {},
        create: { code, cityId: record.id, branchId: branch.id, name: `DEMO ${city.nameKk} / ${city.nameRu} #${index + 1}` },
      });
      if (warehouse.cityId !== record.id || warehouse.branchId !== branch.id) {
        throw new Error(`Demo warehouse conflict for ${code}: its city or branch differs from the fixture. No stock was changed.`);
      }
      warehouses.push(warehouse);
    }
    warehouseRecords.set(city.slug, warehouses);
    await db.deliveryRule.upsert({
      where: { id: stableId(`delivery:${city.slug}`) }, update: {},
      create: {
        id: stableId(`delivery:${city.slug}`), cityId: record.id,
        nameKk: `Демо: ${city.nameKk} қаласы бойынша жеткізу`,
        nameRu: `Демо: доставка по городу ${city.nameRu}`,
        minimumFreeDeliveryAmount: city.slug === 'almaty' ? 50000 : 75000,
        deliveryPrice: city.slug === 'almaty' ? 1500 : city.slug === 'astana' ? 1800 : 2000,
        estimatedHours: ['almaty', 'astana', 'shymkent'].includes(city.slug) ? 24 : 48,
        // Existing or future business rules win the service's newest-rule lookup.
        createdAt: new Date('2000-01-01T00:00:00.000Z'),
      },
    });
  }

  for (const brand of brands) {
    brandRecords.set(brand.slug, await db.brand.upsert({
      where: { slug: brand.slug }, update: {},
      create: { ...brand, descriptionKk: DEMO_NOTICE_KK, descriptionRu: DEMO_NOTICE_RU },
    }));
  }
  for (const { parentSlug, ...category } of categories) {
    const parentId = parentSlug ? categoryRecords.get(parentSlug).id : null;
    const record = await db.category.upsert({
      where: { slug: category.slug }, update: {},
      create: {
        ...category, parentId,
        descriptionKk: DEMO_NOTICE_KK, descriptionRu: DEMO_NOTICE_RU,
      },
    });
    if (record.parentId !== parentId) {
      throw new Error(`Demo category conflict for ${category.slug}: its parent differs from the fixture. No hierarchy was changed.`);
    }
    categoryRecords.set(category.slug, record);
  }

  for (const [productIndex, fixture] of products.entries()) {
    const categoryId = categoryRecords.get(fixture.category).id;
    const product = await db.product.upsert({
      where: { sku: fixture.sku }, update: {},
      create: {
        sku: fixture.sku, supplierSku: fixture.sku, slug: fixture.slug,
        nameKk: fixture.nameKk, nameRu: fixture.nameRu,
        shortDescriptionKk: DEMO_NOTICE_KK, shortDescriptionRu: DEMO_NOTICE_RU,
        descriptionKk: `${fixture.nameKk}. ${DEMO_NOTICE_KK} Бағалар теңгемен көрсетілген.`,
        descriptionRu: `${fixture.nameRu}. ${DEMO_NOTICE_RU} Цены указаны в тенге.`,
        categoryId, brandId: brandRecords.get(fixture.brand).id, unit: fixture.unit,
        isNew: fixture.isNew, isSpecialOffer: fixture.isSpecialOffer,
        isPopular: fixture.isPopular, popularity: fixture.popularity,
        certificateUrl: null, manualUrl: null,
      },
    });
    if (product.slug !== fixture.slug) {
      throw new Error(`Seed SKU conflict for ${fixture.sku}; the existing product was left unchanged.`);
    }
    if (product.categoryId !== categoryId) {
      throw new Error(`Demo product conflict for ${fixture.sku}: its category differs from the fixture. No attributes were added.`);
    }

    for (const [sortOrder, [key, value]] of Object.entries(fixture.attributes).entries()) {
      const mapKey = `${fixture.category}:${key}`;
      let definition = definitionRecords.get(mapKey);
      if (!definition) {
        const template = attributeDefinitions[key];
        definition = await db.attributeDefinition.upsert({
          where: { categoryId_key: { categoryId, key } }, update: {},
          create: { categoryId, key, ...template, sortOrder, filterable: template.type !== 'TEXT', sortable: template.type === 'NUMBER' },
        });
        if (definition.type !== template.type) {
          throw new Error(`Existing attribute ${mapKey} has an incompatible type; no data was overwritten.`);
        }
        definitionRecords.set(mapKey, definition);
      }
      await db.productAttributeValue.upsert({
        where: { productId_attributeDefinitionId: { productId: product.id, attributeDefinitionId: definition.id } },
        update: {},
        create: {
          productId: product.id, attributeDefinitionId: definition.id,
          textValue: ['SELECT', 'TEXT'].includes(definition.type) ? value : null,
          numberValue: definition.type === 'NUMBER' ? value : null,
          booleanValue: definition.type === 'BOOLEAN' ? value : null,
        },
      });
    }

    for (const [cityIndex, city] of cities.entries()) {
      const cityId = cityRecords.get(city.slug).id;
      const availabilityStatus = getDemoAvailability(productIndex, cityIndex);
      await db.productOffer.upsert({
        where: { productId_cityId: { productId: product.id, cityId } }, update: {},
        create: {
          productId: product.id, cityId, ...getDemoPrice(fixture, city), availabilityStatus,
          deliveryEstimateHours: availabilityStatus === 'ON_ORDER' ? 120 : availabilityStatus === 'IN_STOCK' ? 24 : null,
        },
      });
      for (const [warehouseIndex, warehouse] of warehouseRecords.get(city.slug).entries()) {
        await db.productStock.upsert({
          where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } }, update: {},
          create: { productId: product.id, warehouseId: warehouse.id, ...getDemoStock(fixture, productIndex, cityIndex, warehouseIndex) },
        });
      }
    }
  }
};

const seedContent = async (db) => {
  for (const [model, entries] of [['promotion', promotions], ['news', news], ['contentPage', pages]]) {
    for (const entry of entries) {
      await db[model].upsert({ where: { slug: entry.slug }, update: {}, create: entry });
    }
  }
  for (const { key, ...faq } of faqs) {
    const id = stableId(`faq:${key}`);
    await db.faq.upsert({ where: { id }, update: {}, create: { id, ...faq } });
  }
};

const seedDatabase = async (db, { environment = process.env, logger = console } = {}) => {
  validateFixtures();
  const admin = await prepareAdmin(environment, logger);
  const adminResult = await db.$transaction(async (tx) => {
    await seedCatalog(tx);
    await seedContent(tx);
    if (!admin) return 'skipped';
    // The same unique email is reused, but its password/role are never changed.
    const existing = await tx.user.findUnique({ where: { email: admin.email } });
    if (existing) return existing.role === 'ADMIN' ? 'already-exists' : 'existing-account-not-promoted';
    await tx.user.create({ data: { ...admin, firstName: 'Demo Admin', role: 'ADMIN' } });
    return 'created';
  }, { maxWait: 10000, timeout: 120000 });
  if (adminResult === 'existing-account-not-promoted') {
    logger.log('Admin skipped: the configured email already belongs to a non-admin account. Its role and password were not changed.');
  } else if (adminResult === 'already-exists') {
    logger.log('Admin already exists; its password and role were preserved.');
  } else if (adminResult === 'created') {
    logger.log('Admin created using SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD. Credentials are not printed.');
  }
  logger.log(`Demo catalog ready: ${seedManifest.products} products; ${seedManifest.topLevelCategories} top-level + ${seedManifest.subcategories} subcategories; ${seedManifest.cities} cities; ${seedManifest.brands} brands.`);
  logger.log(`Demo logistics: ${seedManifest.branches} branches; ${seedManifest.warehouses} warehouses; ${seedManifest.offers} city offers; ${seedManifest.stocks} stock rows; ${seedManifest.deliveryRules} delivery rules.`);
  logger.log(`Demo content: ${seedManifest.promotions} promotions; ${seedManifest.news} news; ${seedManifest.faqs} FAQs; ${seedManifest.contentPages} pages.`);
  logger.log('Existing records, prices, passwords, inventory and order reservations were preserved. No image or certificate files are implied.');
  return { ...seedManifest, adminResult };
};

const main = async () => {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  try {
    await seedDatabase(db);
  } finally {
    await db.$disconnect();
  }
};

if (require.main === module) {
  main().catch((error) => {
    // Connection errors may include configuration details; do not print secrets.
    console.error(`Seed failed${error.code ? ` (${error.code})` : ''}. ${error.name === 'Error' ? error.message : 'Check PostgreSQL availability and your local configuration.'}`);
    process.exitCode = 1;
  });
}

module.exports = { seedManifest, seedDatabase, stableId, getDemoAvailability, getDemoStock, getDemoPrice, validateFixtures, prepareAdmin };

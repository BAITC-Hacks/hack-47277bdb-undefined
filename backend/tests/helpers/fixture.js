const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../../src/config/prisma');
const { signToken } = require('../../src/utils/jwt');

const createFixture = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(
      `PostgreSQL test connection failed (${error.code || 'connection error'}). ` +
      'Set TEST_DATABASE_URL or check backend/.env, start PostgreSQL, and run npx prisma migrate deploy. ' +
      'Tests do not skip database checks or reset the database.',
    );
  }

  const marker = `jest-${randomUUID()}`;
  const password = `Test-only-${randomUUID()}`;
  const passwordHash = await bcrypt.hash(password, 4);

  // The fixture is all-or-nothing, including on a missing migration or timeout.
  const fixture = await prisma.$transaction(async (tx) => {
    const cities = [];
    for (const suffix of ['a', 'b']) {
      cities.push(await tx.city.create({
        data: { slug: `${marker}-${suffix}`, nameKk: `Тест қаласы ${suffix}`, nameRu: `Тестовый город ${suffix}` },
      }));
    }
    const rootCategory = await tx.category.create({
      data: { slug: `${marker}-root`, nameKk: 'Тест каталогы', nameRu: 'Тестовый каталог' },
    });
    const categories = [];
    for (const suffix of ['breakers', 'accessories']) {
      categories.push(await tx.category.create({
        data: {
          slug: `${marker}-${suffix}`, nameKk: `Тест ${suffix}`, nameRu: `Тест ${suffix}`,
          parentId: rootCategory.id,
        },
      }));
    }
    const brands = [];
    for (const suffix of ['a', 'b']) {
      brands.push(await tx.brand.create({ data: { slug: `${marker}-brand-${suffix}`, name: `Test Brand ${suffix}` } }));
    }
    const warehouses = [];
    for (const [suffix, city, active] of [
      ['a1', cities[0], true], ['a2', cities[0], true], ['disabled', cities[0], false], ['b1', cities[1], true],
    ]) {
      warehouses.push(await tx.warehouse.create({
        data: { code: `${marker}-${suffix}`, name: `Test warehouse ${suffix}`, cityId: city.id, isActive: active },
      }));
    }
    const definition = await tx.attributeDefinition.create({
      data: {
        categoryId: categories[0].id, key: 'rated_current', nameKk: 'Номиналды ток', nameRu: 'Номинальный ток',
        type: 'NUMBER', unit: 'A', filterable: true,
      },
    });
    const products = [];
    const offers = [];
    const stocks = [];
    const stockRows = [
      [[0, 10, 2], [1, 5, 1], [2, 100, 0], [3, 8, 2]],
      [[0, 8, 0], [3, 3, 0]],
      [[0, 0, 0]],
      [[0, 0, 0]],
      [[0, 1, 0]],
    ];
    const prices = [['123.45', '130.00'], ['200.00', '205.00'], ['300.00', '310.00'], ['400.00', '420.00'], ['100.00', '105.00']];
    for (let index = 0; index < 5; index += 1) {
      const product = await tx.product.create({
        data: {
          sku: `${marker}-sku-${index}`, slug: `${marker}-product-${index}`,
          nameKk: `${marker} сынақ тауары ${index}`, nameRu: `${marker} тестовый товар ${index}`,
          categoryId: categories[index === 2 || index === 3 ? 1 : 0].id,
          brandId: brands[index % 2].id, unit: 'дана', popularity: 50 - index,
          isActive: index !== 4, isNew: index === 0, isSpecialOffer: index === 1,
        },
      });
      products.push(product);
      for (let cityIndex = 0; cityIndex < cities.length; cityIndex += 1) {
        offers.push(await tx.productOffer.create({
          data: {
            productId: product.id, cityId: cities[cityIndex].id, webPrice: prices[index][cityIndex],
            storePrice: '450.00', availabilityStatus: index === 2 ? 'ON_ORDER' : index === 3 ? 'OUT_OF_STOCK' : 'IN_STOCK',
          },
        }));
      }
      for (const [warehouseIndex, quantity, reserved] of stockRows[index]) {
        stocks.push(await tx.productStock.create({
          data: { productId: product.id, warehouseId: warehouses[warehouseIndex].id, quantity, reserved },
        }));
      }
      if (index < 2) {
        await tx.productAttributeValue.create({
          data: { productId: product.id, attributeDefinitionId: definition.id, numberValue: index === 0 ? 16 : 25 },
        });
      }
    }
    await tx.deliveryRule.create({
      data: {
        cityId: cities[0].id, nameKk: 'Тест жеткізуі', nameRu: 'Тестовая доставка',
        deliveryPrice: '25.00', minimumFreeDeliveryAmount: '500.00',
      },
    });
    const users = [];
    for (const role of ['customer', 'other', 'admin']) {
      users.push(await tx.user.create({
        data: {
          email: `${marker}-${role}@example.com`, password: passwordHash, firstName: 'Test',
          role: role === 'admin' ? 'ADMIN' : 'CUSTOMER',
        },
      }));
    }
    return { cities, rootCategory, categories, brands, warehouses, definition, products, stocks, offers, users };
  }, { timeout: 20000 });

  return {
    ...fixture, marker, password,
    registrationEmail: `${marker}-register@example.com`,
    tokens: fixture.users.map(signToken),
  };
};

const resetCommerce = async (fixture) => {
  const cityIds = fixture.cities.map(({ id }) => id);
  const productIds = fixture.products.map(({ id }) => id);
  await prisma.$transaction(async (tx) => {
    // Only rows attached to this run's UUIDs are touched; no seed/user data is reset.
    await tx.order.deleteMany({ where: { cityId: { in: cityIds } } });
    await tx.cart.deleteMany({ where: { cityId: { in: cityIds } } });
    await tx.favorite.deleteMany({ where: { productId: { in: productIds } } });
    await tx.comparisonItem.deleteMany({ where: { productId: { in: productIds } } });
    for (const stock of fixture.stocks) {
      await tx.productStock.update({ where: { id: stock.id }, data: { quantity: stock.quantity, reserved: stock.reserved } });
    }
    for (const offer of fixture.offers) {
      await tx.productOffer.update({ where: { id: offer.id }, data: { webPrice: offer.webPrice } });
    }
  });
};

const cleanupFixture = async (fixture) => {
  if (!fixture) return;
  const cityIds = fixture.cities.map(({ id }) => id);
  const productIds = fixture.products.map(({ id }) => id);
  await prisma.$transaction(async (tx) => {
    await tx.order.deleteMany({ where: { cityId: { in: cityIds } } });
    await tx.oneClickOrder.deleteMany({ where: { productId: { in: productIds } } });
    await tx.cart.deleteMany({ where: { cityId: { in: cityIds } } });
    await tx.product.deleteMany({ where: { id: { in: productIds } } });
    await tx.warehouse.deleteMany({ where: { id: { in: fixture.warehouses.map(({ id }) => id) } } });
    await tx.attributeDefinition.deleteMany({ where: { id: fixture.definition.id } });
    await tx.category.deleteMany({ where: { id: { in: [...fixture.categories, fixture.rootCategory].map(({ id }) => id) } } });
    await tx.brand.deleteMany({ where: { id: { in: fixture.brands.map(({ id }) => id) } } });
    await tx.city.deleteMany({ where: { id: { in: cityIds } } });
    await tx.user.deleteMany({
      where: { email: { in: [...fixture.users.map(({ email }) => email), fixture.registrationEmail] } },
    });
  });
};

module.exports = { createFixture, resetCommerce, cleanupFixture };

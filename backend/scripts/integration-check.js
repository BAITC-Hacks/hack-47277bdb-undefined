const { randomUUID } = require('crypto');
const prisma = require('../src/config/prisma');
const productQueryService = require('../src/modules/products/product-query.service');
const catalogFilterService = require('../src/modules/catalog/catalog-filter.service');
const priceListService = require('../src/modules/catalog/price-list.service');
const favoriteService = require('../src/modules/favorites/favorite.service');
const comparisonService = require('../src/modules/comparison/comparison.service');
const cartService = require('../src/modules/cart/cart.service');
const orderService = require('../src/modules/orders/order.service');
const oneClickService = require('../src/modules/one-click-orders/oneClickOrder.service');
const adminMiddleware = require('../src/middleware/admin.middleware');
const adminResourceService = require('../src/modules/admin/admin-resource.service');

const suffix = randomUUID().slice(0, 8);
const marker = `phase2-check-${suffix}`;
const ids = {};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const checkAdminMiddleware = () => {
  let customerError;
  adminMiddleware({ user: { role: 'CUSTOMER' } }, {}, (error) => {
    customerError = error;
  });
  assert(customerError?.code === 'ADMIN_REQUIRED', 'Customer unexpectedly passed admin middleware.');
  let adminError = 'not-called';
  adminMiddleware({ user: { role: 'ADMIN' } }, {}, (error) => {
    adminError = error;
  });
  assert(adminError === undefined, 'Admin did not pass admin middleware.');
};

const cleanup = async () => {
  if (ids.product) {
    await prisma.order.deleteMany({ where: { items: { some: { productId: ids.product } } } });
    await prisma.oneClickOrder.deleteMany({ where: { productId: ids.product } });
    await prisma.favorite.deleteMany({ where: { productId: ids.product } });
    await prisma.comparisonItem.deleteMany({ where: { productId: ids.product } });
    await prisma.cartItem.deleteMany({ where: { productId: ids.product } });
  }
  if (ids.city) await prisma.cart.deleteMany({ where: { cityId: ids.city } });
  if (ids.product) {
    await prisma.productAttributeValue.deleteMany({ where: { productId: ids.product } });
    await prisma.productStock.deleteMany({ where: { productId: ids.product } });
    await prisma.productOffer.deleteMany({ where: { productId: ids.product } });
    await prisma.product.deleteMany({ where: { id: ids.product } });
  }
  if (ids.definition) await prisma.attributeDefinition.deleteMany({ where: { id: ids.definition } });
  if (ids.warehouse) await prisma.warehouse.deleteMany({ where: { id: ids.warehouse } });
  if (ids.brand) await prisma.brand.deleteMany({ where: { id: ids.brand } });
  if (ids.category) await prisma.category.deleteMany({ where: { id: ids.category } });
  if (ids.city) await prisma.city.deleteMany({ where: { id: ids.city } });
  if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } });
};

const main = async () => {
  try {
    const city = await prisma.city.create({
      data: { slug: marker, nameKk: 'Тест қаласы', nameRu: 'Тестовый город' },
    });
    ids.city = city.id;
    const category = await prisma.category.create({
      data: { slug: `${marker}-category`, nameKk: 'Тест санаты', nameRu: 'Тестовая категория' },
    });
    ids.category = category.id;
    const brand = await prisma.brand.create({ data: { slug: `${marker}-brand`, name: 'Phase 2 Test' } });
    ids.brand = brand.id;
    const product = await prisma.product.create({
      data: {
        sku: `CHECK-${suffix}`,
        slug: `${marker}-product`,
        nameKk: 'Тест өнімі',
        nameRu: 'Тестовый товар',
        categoryId: category.id,
        brandId: brand.id,
        unit: 'дана',
        popularity: 10,
      },
    });
    ids.product = product.id;
    const warehouse = await prisma.warehouse.create({
      data: { cityId: city.id, name: 'Phase 2 check warehouse', code: `CHECK-${suffix}` },
    });
    ids.warehouse = warehouse.id;
    await prisma.productOffer.create({
      data: {
        productId: product.id,
        cityId: city.id,
        webPrice: '123.45',
        storePrice: '130.00',
        availabilityStatus: 'IN_STOCK',
      },
    });
    await prisma.productStock.create({
      data: { productId: product.id, warehouseId: warehouse.id, quantity: 5, reserved: 0 },
    });
    await prisma.deliveryRule.create({
      data: {
        cityId: city.id,
        nameKk: 'Тест жеткізуі',
        nameRu: 'Тестовая доставка',
        minimumFreeDeliveryAmount: '500.00',
        deliveryPrice: '25.00',
      },
    });
    const definition = await prisma.attributeDefinition.create({
      data: {
        categoryId: category.id,
        key: 'rated_current',
        nameKk: 'Номиналды ток',
        nameRu: 'Номинальный ток',
        type: 'NUMBER',
        unit: 'A',
        filterable: true,
      },
    });
    ids.definition = definition.id;
    await prisma.productAttributeValue.create({
      data: { productId: product.id, attributeDefinitionId: definition.id, numberValue: 16 },
    });
    const user = await prisma.user.create({
      data: {
        email: `${marker}@example.com`,
        password: 'integration-check-only',
        firstName: 'Check',
      },
    });
    ids.user = user.id;

    const search = await productQueryService.searchProducts({
      query: {
        city: city.slug,
        minPrice: 100,
        maxPrice: 200,
        inStock: true,
        attributes: 'rated_current:16',
        sort: 'price_asc',
        page: 1,
        limit: 20,
      },
      language: 'kk',
    });
    assert(search.data.length === 1 && search.data[0].cityOffer.webPrice === 123.45, 'Advanced search failed.');
    const filters = await catalogFilterService.getCategoryFilters({
      slug: category.slug,
      citySlug: city.slug,
      language: 'kk',
    });
    assert(filters.attributes[0].possibleValues[0] === 16, 'Dynamic category filters failed.');

    await favoriteService.addFavorite(user.id, product.id);
    assert((await favoriteService.listFavorites(user.id, 'kk')).length === 1, 'Favorites failed.');
    await favoriteService.removeFavorite(user.id, product.id);

    const comparisonIdentity = { userId: null, sessionId: randomUUID() };
    await comparisonService.addItem(comparisonIdentity, product.id);
    await comparisonService.addItem(comparisonIdentity, product.id);
    const comparison = await comparisonService.getComparison(comparisonIdentity, 'kk');
    assert(comparison.products.length === 1 && comparison.attributes.length === 1, 'Guest comparison failed.');
    await comparisonService.clear(comparisonIdentity);

    const authenticatedIdentity = { userId: user.id, sessionId: null };
    await cartService.changeCity(authenticatedIdentity, city.id, 'kk');
    const authenticatedCart = await cartService.addItem(
      authenticatedIdentity,
      { productId: product.id, quantity: 1 },
      'kk',
    );
    assert(authenticatedCart.items.length === 1, 'Authenticated cart failed.');
    await cartService.clearCart(authenticatedIdentity);

    const firstGuest = { userId: null, sessionId: randomUUID() };
    await cartService.changeCity(firstGuest, city.id, 'kk');
    const cart = await cartService.addItem(
      firstGuest,
      { productId: product.id, quantity: 2, unitPrice: 1 },
      'kk',
    );
    assert(cart.items[0].unitPrice === 123.45 && cart.items[0].availableQuantity === 5, 'Cart price/stock failed.');
    const cancelledOrder = await orderService.createOrder({
      identity: firstGuest,
      language: 'kk',
      payload: {
        customerName: 'Integration Check',
        phone: '+77000000000',
        email: `${marker}@example.com`,
        customerType: 'PERSON',
        deliveryMethod: 'DELIVERY',
        deliveryAddress: 'Integration street 1',
        paymentMethod: 'CASH_ON_DELIVERY',
      },
    });
    assert(Number(cancelledOrder.total) === 271.9, 'Backend order/delivery price calculation failed.');
    let stock = await prisma.productStock.findFirst({ where: { productId: product.id } });
    assert(stock.reserved === 2 && stock.quantity === 5, 'Stock reservation failed.');
    await orderService.updateOrderStatus(cancelledOrder.id, { status: 'CANCELLED' });
    stock = await prisma.productStock.findFirst({ where: { productId: product.id } });
    assert(stock.reserved === 0 && stock.quantity === 5, 'Cancellation release failed.');

    const secondGuest = { userId: null, sessionId: randomUUID() };
    await cartService.changeCity(secondGuest, city.id, 'kk');
    await cartService.addItem(secondGuest, { productId: product.id, quantity: 1 }, 'kk');
    const completedOrder = await orderService.createOrder({
      identity: secondGuest,
      language: 'kk',
      payload: {
        customerName: 'Integration Check',
        phone: '+77000000000',
        email: `${marker}@example.com`,
        customerType: 'PERSON',
        deliveryMethod: 'PICKUP',
        paymentMethod: 'POS_ON_PICKUP',
      },
    });
    await orderService.updateOrderStatus(completedOrder.id, { status: 'COMPLETED' });
    stock = await prisma.productStock.findFirst({ where: { productId: product.id } });
    assert(stock.reserved === 0 && stock.quantity === 4, 'Completion stock deduction failed.');

    await oneClickService.createOneClickOrder({
      productId: product.id,
      cityId: city.id,
      quantity: 1,
      customerName: 'Integration Check',
      phone: '+77000000000',
      email: `${marker}@example.com`,
    });
    const priceList = await priceListService.generatePriceList(city.slug);
    assert(priceList.buffer.byteLength > 1000, 'Price-list generation failed.');
    const adminProduct = await adminResourceService.getResource('products', product.id);
    assert(adminProduct.sku === product.sku, 'Admin resource read failed.');
    await adminResourceService.updateResource('products', product.id, { popularity: 11 });
    assert(
      (await adminResourceService.getResource('products', product.id)).popularity === 11,
      'Admin resource update failed.',
    );
    checkAdminMiddleware();
    console.log('Phase 2 database integration checks passed.');
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

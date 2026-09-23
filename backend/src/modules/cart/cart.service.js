const { Prisma } = require('@prisma/client');
const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { getLocalizedValue } = require('../../utils/localization');
const { getCityStocks, resolveCatalogCity } = require('../products/product-query.service');
const serializable = require('../../utils/transaction');

const ownerWhere = ({ userId, sessionId }) => (userId ? { userId } : { sessionId });

const findCart = (identity, db = prisma) =>
  db.cart.findFirst({
    where: ownerWhere(identity),
    include: {
      city: true,
      items: {
        include: {
          product: {
            include: {
              brand: true,
              category: true,
              images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

const emptyCart = () => ({
  id: null,
  city: null,
  items: [],
  subtotal: 0,
  totalItemCount: 0,
  warnings: [],
});

const serializeCart = async (cart, language, db = prisma) => {
  if (!cart) return emptyCart();
  const productIds = cart.items.map((item) => item.productId);
  const [offers, stockTotals] = await Promise.all([
    productIds.length
      ? db.productOffer.findMany({
          where: { productId: { in: productIds }, cityId: cart.cityId, isActive: true },
        })
      : [],
    getCityStocks(productIds, cart.cityId, db),
  ]);
  const offerMap = new Map(offers.map((offer) => [offer.productId, offer]));
  const warnings = [];
  let subtotal = new Prisma.Decimal(0);
  let totalItemCount = 0;
  const items = cart.items.map((item) => {
    const product = item.product;
    const offer = offerMap.get(product.id) || null;
    const availableQuantity = stockTotals.get(product.id) || 0;
    let warning = null;
    if (!cart.city.isActive) warning = 'CITY_INACTIVE';
    else if (!product.isActive) warning = 'PRODUCT_INACTIVE';
    else if (!offer) warning = 'OFFER_UNAVAILABLE';
    else if (item.quantity > availableQuantity) warning = 'INSUFFICIENT_STOCK';
    if (warning) warnings.push({ itemId: item.id, productId: product.id, code: warning });

    const unitPrice = offer ? new Prisma.Decimal(offer.webPrice) : new Prisma.Decimal(0);
    const lineTotal = unitPrice.mul(item.quantity);
    subtotal = subtotal.add(lineTotal);
    totalItemCount += item.quantity;
    return {
      id: item.id,
      product: {
        id: product.id,
        sku: product.sku,
        slug: product.slug,
        name: getLocalizedValue(product, 'name', language),
        unit: product.unit,
        brand: product.brand?.name || null,
        category: getLocalizedValue(product.category, 'name', language),
        image: product.images[0]?.url || null,
      },
      unitPrice: Number(unitPrice),
      quantity: item.quantity,
      lineTotal: Number(lineTotal),
      availableQuantity,
      availabilityStatus: offer?.availabilityStatus || 'OUT_OF_STOCK',
      warning,
    };
  });
  return {
    id: cart.id,
    city: {
      id: cart.city.id,
      slug: cart.city.slug,
      name: getLocalizedValue(cart.city, 'name', language),
    },
    items,
    subtotal: Number(subtotal),
    totalItemCount,
    warnings,
  };
};

const getCart = async (identity, language, db = prisma) =>
  serializeCart(await findCart(identity, db), language, db);

const ensureCart = async (identity, cityId, db = prisma) => {
  const existing = await db.cart.findFirst({ where: ownerWhere(identity) });
  if (existing) return existing;
  const city = cityId
    ? await db.city.findFirst({ where: { id: cityId, isActive: true } })
    : await resolveCatalogCity(null, true, db);
  if (!city) throw new ApiError(404, 'CITY_NOT_FOUND', 'Қала табылмады');
  return db.cart.upsert({
    where: ownerWhere(identity),
    create: { ...identity, cityId: city.id },
    update: {},
  });
};

const validateCartQuantity = async (productId, cityId, quantity, db = prisma) => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    throw new ApiError(422, 'INVALID_QUANTITY', 'quantity 1–10000 аралығындағы бүтін сан болуы керек');
  }
  const city = await db.city.findFirst({ where: { id: cityId, isActive: true } });
  if (!city) throw new ApiError(409, 'CITY_INACTIVE', 'Себет қаласы белсенді емес');
  const [product, offer, stockTotals] = await Promise.all([
    db.product.findFirst({ where: { id: productId, isActive: true } }),
    db.productOffer.findFirst({ where: { productId, cityId, isActive: true } }),
    getCityStocks([productId], cityId, db),
  ]);
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Тауар табылмады');
  if (!offer) throw new ApiError(409, 'PRODUCT_NOT_OFFERED_IN_CITY', 'Бұл қалада тауар ұсынылмайды');
  const available = stockTotals.get(productId) || 0;
  if (quantity > available) {
    throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Қоймадағы қолжетімді тауар саны жеткіліксіз', {
      requested: quantity,
      available,
    });
  }
  return { product, offer, available };
};

// The caller owns the transaction. Assistant confirmation uses this same logic
// so consuming a pending action and changing its cart commit (or roll back) together.
const addItemInTransaction = async (identity, { productId, quantity }, language, tx, { cityId } = {}) => {
  if (!tx) throw new TypeError('addItemInTransaction requires the caller transaction');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    throw new ApiError(422, 'INVALID_QUANTITY', 'quantity 1–10000 аралығындағы бүтін сан болуы керек');
  }
  const cart = await ensureCart(identity, cityId, tx);
  if (cityId && cart.cityId !== cityId) {
    throw new ApiError(409, 'CART_CITY_MISMATCH', 'Себет қаласы өзгерді. Қаланы сәйкестендіріп, ұсынысты қайта дайындаңыз');
  }
  const existing = await tx.cartItem.findUnique({
    where: { cartId_productId: { cartId: cart.id, productId } },
  });
  const requestedQuantity = (existing?.quantity || 0) + quantity;
  await validateCartQuantity(productId, cart.cityId, requestedQuantity, tx);
  await tx.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    create: { cartId: cart.id, productId, quantity },
    update: { quantity: requestedQuantity },
  });
  return getCart(identity, language, tx);
};

const addItem = (identity, payload, language) =>
  serializable((tx) => addItemInTransaction(identity, payload, language, tx));

const updateItem = (identity, itemId, quantity, language) => serializable(async (tx) => {
  const cart = await tx.cart.findFirst({ where: ownerWhere(identity) });
  if (!cart) throw new ApiError(404, 'CART_NOT_FOUND', 'Себет табылмады');
  const item = await tx.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
  if (!item) throw new ApiError(404, 'CART_ITEM_NOT_FOUND', 'Себеттегі тауар табылмады');
  await validateCartQuantity(item.productId, cart.cityId, quantity, tx);
  await tx.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return getCart(identity, language, tx);
});

const removeItem = (identity, itemId, language) => serializable(async (tx) => {
  const cart = await tx.cart.findFirst({ where: ownerWhere(identity) });
  if (!cart) return emptyCart();
  await tx.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
  return getCart(identity, language, tx);
});

const clearCart = async (identity) => {
  const cart = await prisma.cart.findFirst({ where: ownerWhere(identity) });
  if (cart) await prisma.cart.delete({ where: { id: cart.id } });
};

const changeCity = (identity, cityId, language) => serializable(async (tx) => {
  const city = await tx.city.findFirst({ where: { id: cityId, isActive: true } });
  if (!city) throw new ApiError(404, 'CITY_NOT_FOUND', 'Қала табылмады');
  const cart = await ensureCart(identity, cityId, tx);
  await tx.cart.update({ where: { id: cart.id }, data: { cityId } });
  return getCart(identity, language, tx);
});

module.exports = {
  getCart,
  findCart,
  serializeCart,
  ensureCart,
  validateCartQuantity,
  addItemInTransaction,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  changeCity,
  ownerWhere,
};

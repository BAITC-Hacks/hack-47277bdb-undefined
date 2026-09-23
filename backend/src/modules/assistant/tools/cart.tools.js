const { createHash } = require('crypto');
const { Prisma } = require('@prisma/client');
const prisma = require('../../../config/prisma');
const ApiError = require('../../../utils/apiError');
const { getLocalizedValue } = require('../../../utils/localization');
const { resolveCatalogCity } = require('../../products/product-query.service');
const { getCart, validateCartQuantity, addItemInTransaction } = require('../../cart/cart.service');

// Only state that affects the proposed mutation is included: presentation
// language, image URLs, timestamps and unrelated stock fluctuations do not.
const fingerprint = (cart) => createHash('sha256').update(JSON.stringify({
  id: cart.id,
  cityId: cart.city?.id || null,
  items: cart.items.map((item) => ({
    productId: item.product.id,
    quantity: item.quantity,
    unitPrice: new Prisma.Decimal(item.unitPrice).toString(),
  })).sort((left, right) => left.productId.localeCompare(right.productId)),
})).digest('hex');

const assertCityMatches = (cart, cityId) => {
  if (cart.id && cart.city?.id !== cityId) {
    throw new ApiError(409, 'CART_CITY_MISMATCH', 'Себет қаласы ұсыныс қаласына сәйкес емес. Ұсынысты қайта дайындаңыз');
  }
};

const assertQuantity = (quantity) => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    throw new ApiError(422, 'INVALID_QUANTITY', 'quantity 1–10000 аралығындағы бүтін сан болуы керек');
  }
};

const accumulatedQuantity = (cart, productId, quantity) =>
  (cart.items.find((item) => item.product.id === productId)?.quantity || 0) + quantity;

// Preparing a proposal never creates a cart, changes its city or reserves stock.
// The assistant service persists this server-built snapshot with its owner and token.
const prepare = async ({ identity, productId, quantity, city, language }, db = prisma) => {
  assertQuantity(quantity);
  const selectedCity = await resolveCatalogCity(city, false, db);
  if (!selectedCity) throw new ApiError(422, 'CITY_REQUIRED', 'Алдымен қаланы таңдаңыз');
  const cart = await getCart(identity, language, db);
  assertCityMatches(cart, selectedCity.id);
  const { product, offer } = await validateCartQuantity(
    productId, selectedCity.id, accumulatedQuantity(cart, productId, quantity), db,
  );
  return {
    productId,
    quantity,
    cityId: selectedCity.id,
    citySlug: selectedCity.slug,
    unitPrice: Number(offer.webPrice),
    productName: getLocalizedValue(product, 'name', language),
    cartFingerprint: fingerprint(cart),
  };
};

// Requires the pending-action service's Prisma transaction, AFTER it has checked
// ownership/token/expiry and locked or atomically claimed the pending action.
// Never call an HTTP cart endpoint or open an independent transaction here.
const confirm = async ({ identity, pending, language }, tx) => {
  if (!tx) throw new TypeError('Assistant cart confirmation requires the caller transaction');
  assertQuantity(pending.quantity);
  const cart = await getCart(identity, language, tx);
  assertCityMatches(cart, pending.cityId);
  const { offer } = await validateCartQuantity(
    pending.productId, pending.cityId, accumulatedQuantity(cart, pending.productId, pending.quantity), tx,
  );
  if (!new Prisma.Decimal(offer.webPrice).equals(pending.unitPrice)) {
    throw new ApiError(409, 'PRICE_CHANGED', 'Тауар бағасы өзгерді. Жаңа бағаны қарап, ұсынысты қайта растаңыз');
  }
  if (fingerprint(cart) !== pending.cartFingerprint) {
    throw new ApiError(409, 'CART_CHANGED', 'Себет өзгерді. Ұсынысты қайта дайындаңыз');
  }
  return addItemInTransaction(identity, {
    productId: pending.productId, quantity: pending.quantity,
  }, language, tx, { cityId: pending.cityId });
};

module.exports = { prepare, confirm };

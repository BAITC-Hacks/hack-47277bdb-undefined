const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { getCityPrice, getCityStock } = require('../products/product-query.service');

const createOneClickOrder = async (payload) => {
  const [product, city] = await Promise.all([
    prisma.product.findFirst({ where: { id: payload.productId, isActive: true } }),
    prisma.city.findFirst({ where: { id: payload.cityId, isActive: true } }),
  ]);
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Тауар табылмады');
  if (!city) throw new ApiError(404, 'CITY_NOT_FOUND', 'Қала табылмады');
  const [offer, stock] = await Promise.all([
    getCityPrice(product.id, city.id),
    getCityStock(product.id, city.id),
  ]);
  if (!offer) throw new ApiError(409, 'PRODUCT_NOT_OFFERED_IN_CITY', 'Бұл қалада тауар ұсынылмайды');
  if (payload.quantity > stock.availableQuantity) {
    throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Қолжетімді тауар саны жеткіліксіз', {
      requested: payload.quantity,
      available: stock.availableQuantity,
    });
  }
  return prisma.oneClickOrder.create({
    data: {
      productId: product.id,
      cityId: city.id,
      quantity: payload.quantity,
      customerName: payload.customerName.trim(),
      phone: payload.phone.trim(),
      email: payload.email?.trim().toLowerCase() || null,
    },
  });
};

module.exports = { createOneClickOrder };

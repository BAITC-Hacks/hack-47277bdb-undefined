const { randomBytes } = require('crypto');
const { Prisma } = require('@prisma/client');
const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { getLocalizedValue } = require('../../utils/localization');
const { findCart } = require('../cart/cart.service');
const { calculateDelivery } = require('../delivery/delivery.service');
const { assertValidStock } = require('../products/product.service');

const createOrderNumber = () => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `EKT-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
};

const lockCityStock = (tx, productId, cityId) =>
  tx.$queryRaw(
    Prisma.sql`
      SELECT ps."id", ps."quantity", ps."reserved", ps."warehouseId"
      FROM "ProductStock" AS ps
      INNER JOIN "Warehouse" AS w ON w."id" = ps."warehouseId"
      WHERE ps."productId" = ${productId}::uuid
        AND w."cityId" = ${cityId}::uuid
        AND w."isActive" = true
      ORDER BY ps."updatedAt" ASC, ps."id" ASC
      FOR UPDATE OF ps
    `,
  );

const allocateStock = async (tx, productId, cityId, requestedQuantity) => {
  const stocks = await lockCityStock(tx, productId, cityId);
  const available = stocks.reduce((total, stock) => {
    assertValidStock(stock);
    return total + stock.quantity - stock.reserved;
  }, 0);
  if (requestedQuantity > available) {
    throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Қоймадағы қолжетімді тауар саны жеткіліксіз', {
      productId,
      requested: requestedQuantity,
      available,
    });
  }

  let remaining = requestedQuantity;
  const allocations = [];
  for (const stock of stocks) {
    if (remaining === 0) break;
    const stockAvailable = stock.quantity - stock.reserved;
    const allocated = Math.min(stockAvailable, remaining);
    if (allocated > 0) {
      await tx.productStock.update({
        where: { id: stock.id },
        data: { reserved: { increment: allocated } },
      });
      allocations.push({ productStockId: stock.id, quantity: allocated });
      remaining -= allocated;
    }
  }
  return allocations;
};

const createOrder = async ({ identity, payload, language }) =>
  prisma.$transaction(
    async (tx) => {
      const cart = await findCart(identity, tx);
      if (!cart || cart.items.length === 0) {
        throw new ApiError(409, 'CART_EMPTY', 'Себет бос');
      }
      if (payload.customerType === 'COMPANY' && (!payload.companyName || !payload.bin)) {
        throw new ApiError(422, 'COMPANY_DETAILS_REQUIRED', 'Компания атауы мен БСН қажет');
      }
      if (payload.deliveryMethod === 'DELIVERY' && !payload.deliveryAddress) {
        throw new ApiError(422, 'DELIVERY_ADDRESS_REQUIRED', 'Жеткізу мекенжайы қажет');
      }

      const productIds = cart.items.map((item) => item.productId);
      const offers = await tx.productOffer.findMany({
        where: { productId: { in: productIds }, cityId: cart.cityId, isActive: true },
      });
      const offerMap = new Map(offers.map((offer) => [offer.productId, offer]));
      const preparedItems = [];
      let subtotal = new Prisma.Decimal(0);

      const sortedCartItems = [...cart.items].sort((left, right) =>
        left.productId.localeCompare(right.productId),
      );
      for (const cartItem of sortedCartItems) {
        if (!cartItem.product.isActive) {
          throw new ApiError(409, 'PRODUCT_INACTIVE', 'Себеттегі тауар белсенді емес', {
            productId: cartItem.productId,
          });
        }
        const offer = offerMap.get(cartItem.productId);
        if (!offer) {
          throw new ApiError(409, 'PRODUCT_NOT_OFFERED_IN_CITY', 'Себеттегі тауар бұл қалада ұсынылмайды', {
            productId: cartItem.productId,
          });
        }
        const allocations = await allocateStock(
          tx,
          cartItem.productId,
          cart.cityId,
          cartItem.quantity,
        );
        const unitPrice = new Prisma.Decimal(offer.webPrice);
        const lineTotal = unitPrice.mul(cartItem.quantity);
        subtotal = subtotal.add(lineTotal);
        preparedItems.push({ cartItem, unitPrice, lineTotal, allocations });
      }

      const delivery = await calculateDelivery({
        cityId: cart.cityId,
        subtotal,
        deliveryMethod: payload.deliveryMethod,
        db: tx,
      });
      const total = subtotal.add(delivery.deliveryPrice);
      const order = await tx.order.create({
        data: {
          orderNumber: createOrderNumber(),
          userId: identity.userId,
          cityId: cart.cityId,
          customerName: payload.customerName.trim(),
          phone: payload.phone.trim(),
          email: payload.email.trim().toLowerCase(),
          customerType: payload.customerType,
          companyName: payload.companyName?.trim() || null,
          bin: payload.bin?.trim() || null,
          deliveryMethod: payload.deliveryMethod,
          paymentMethod: payload.paymentMethod,
          deliveryAddress: payload.deliveryAddress?.trim() || null,
          comment: payload.comment?.trim() || null,
          subtotal,
          deliveryPrice: delivery.deliveryPrice,
          total,
          paymentStatus: payload.paymentMethod === 'ONLINE_CARD' ? 'PENDING' : 'UNPAID',
        },
      });

      for (const prepared of preparedItems) {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: prepared.cartItem.productId,
            productNameSnapshot: getLocalizedValue(prepared.cartItem.product, 'name', language),
            skuSnapshot: prepared.cartItem.product.sku,
            quantity: prepared.cartItem.quantity,
            unitPrice: prepared.unitPrice,
            lineTotal: prepared.lineTotal,
          },
        });
        await tx.orderStockReservation.createMany({
          data: prepared.allocations.map((allocation) => ({
            orderItemId: orderItem.id,
            productStockId: allocation.productStockId,
            quantity: allocation.quantity,
          })),
        });
      }
      await tx.cart.delete({ where: { id: cart.id } });
      return getOrderByIdInternal(tx, order.id);
    },
    { isolationLevel: 'Serializable', timeout: 15000 },
  );

const orderInclude = {
  city: true,
  items: { include: { product: { select: { slug: true } } } },
};

const getOrderByIdInternal = (db, id) => db.order.findUnique({ where: { id }, include: orderInclude });

const serializeOrder = (order, language) => ({
  id: order.id,
  orderNumber: order.orderNumber,
  city: {
    id: order.city.id,
    slug: order.city.slug,
    name: getLocalizedValue(order.city, 'name', language),
  },
  customerName: order.customerName,
  phone: order.phone,
  email: order.email,
  customerType: order.customerType,
  companyName: order.companyName,
  bin: order.bin,
  deliveryMethod: order.deliveryMethod,
  paymentMethod: order.paymentMethod,
  deliveryAddress: order.deliveryAddress,
  comment: order.comment,
  subtotal: Number(order.subtotal),
  deliveryPrice: Number(order.deliveryPrice),
  total: Number(order.total),
  status: order.status,
  paymentStatus: order.paymentStatus,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  items: order.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productSlug: item.product.slug,
    productName: item.productNameSnapshot,
    sku: item.skuSnapshot,
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    lineTotal: Number(item.lineTotal),
  })),
});

const listUserOrders = async (userId, language) => {
  const orders = await prisma.order.findMany({
    where: { userId },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
  });
  return orders.map((order) => serializeOrder(order, language));
};

const getUserOrder = async (userId, orderId, language) => {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: orderInclude,
  });
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Тапсырыс табылмады');
  return serializeOrder(order, language);
};

const processReservations = async (tx, orderId, targetStatus) => {
  const reservations = await tx.orderStockReservation.findMany({
    where: { orderItem: { orderId }, status: 'RESERVED' },
  });
  if (reservations.length === 0) return;
  const ids = reservations.map((reservation) => reservation.productStockId);
  const lockedStocks = await tx.$queryRaw(
    Prisma.sql`
      SELECT "id", "quantity", "reserved"
      FROM "ProductStock"
      WHERE "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY "id" ASC
      FOR UPDATE
    `,
  );
  const stockMap = new Map(lockedStocks.map((stock) => [stock.id, stock]));

  for (const reservation of reservations) {
    const stock = stockMap.get(reservation.productStockId);
    if (!stock || stock.reserved < reservation.quantity) {
      throw new ApiError(409, 'RESERVATION_DATA_CONFLICT', 'Қойма резерві тапсырысқа сәйкес емес');
    }
    if (targetStatus === 'COMPLETED' && stock.quantity < reservation.quantity) {
      throw new ApiError(409, 'STOCK_DATA_INTEGRITY_ERROR', 'Қойма саны резервтен аз');
    }
    await tx.productStock.update({
      where: { id: reservation.productStockId },
      data:
        targetStatus === 'COMPLETED'
          ? {
              quantity: { decrement: reservation.quantity },
              reserved: { decrement: reservation.quantity },
            }
          : { reserved: { decrement: reservation.quantity } },
    });
    await tx.orderStockReservation.update({
      where: { id: reservation.id },
      data: { status: targetStatus === 'COMPLETED' ? 'CONSUMED' : 'RELEASED' },
    });
  }
};

const updateOrderStatus = async (orderId, { status, paymentStatus }) =>
  prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Тапсырыс табылмады');
      if (['CANCELLED', 'COMPLETED'].includes(order.status) && status !== order.status) {
        throw new ApiError(409, 'ORDER_STATUS_FINAL', 'Аяқталған тапсырыс мәртебесін өзгертуге болмайды');
      }
      if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
        await processReservations(tx, order.id, 'CANCELLED');
      }
      if (status === 'COMPLETED' && order.status !== 'COMPLETED') {
        await processReservations(tx, order.id, 'COMPLETED');
      }
      return tx.order.update({
        where: { id: order.id },
        data: { status, ...(paymentStatus ? { paymentStatus } : {}) },
      });
    },
    { isolationLevel: 'Serializable', timeout: 15000 },
  );

const listAdminOrders = async ({ page, limit, status }) => {
  const skip = (page - 1) * limit;
  const where = status ? { status } : {};
  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.order.count({ where }),
  ]);
  return { orders, total };
};

module.exports = {
  createOrder,
  listUserOrders,
  getUserOrder,
  serializeOrder,
  updateOrderStatus,
  listAdminOrders,
  allocateStock,
};

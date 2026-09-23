const { Prisma } = require('@prisma/client');
const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');

const calculateDelivery = async ({ cityId, subtotal, deliveryMethod, db = prisma }) => {
  if (deliveryMethod === 'PICKUP') {
    return { deliveryPrice: new Prisma.Decimal(0), estimatedHours: null, ruleId: null };
  }

  const specificRule = await db.deliveryRule.findFirst({
    where: { cityId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  const rule =
    specificRule ||
    (await db.deliveryRule.findFirst({
      where: { cityId: null, isActive: true },
      orderBy: { createdAt: 'desc' },
    }));
  if (!rule) {
    throw new ApiError(
      409,
      'DELIVERY_RULE_NOT_CONFIGURED',
      'Бұл қала үшін жеткізу ережесі бапталмаған',
    );
  }

  const orderSubtotal = new Prisma.Decimal(subtotal);
  const freeThreshold = rule.minimumFreeDeliveryAmount;
  const isFree = freeThreshold !== null && orderSubtotal.greaterThanOrEqualTo(freeThreshold);
  return {
    deliveryPrice: isFree ? new Prisma.Decimal(0) : new Prisma.Decimal(rule.deliveryPrice || 0),
    estimatedHours: rule.estimatedHours,
    ruleId: rule.id,
  };
};

module.exports = { calculateDelivery };

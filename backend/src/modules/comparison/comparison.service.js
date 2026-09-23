const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { getLocalizedValue } = require('../../utils/localization');

const MAX_COMPARISON_ITEMS = 4;
const ownerWhere = ({ userId, sessionId }) => (userId ? { userId } : { sessionId });

const addItem = async (identity, productId) => {
  const product = await prisma.product.findFirst({ where: { id: productId, isActive: true } });
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Тауар табылмады');

  return prisma.$transaction(
    async (tx) => {
      const owner = ownerWhere(identity);
      const existing = await tx.comparisonItem.findFirst({ where: { ...owner, productId } });
      if (existing) return existing;
      const count = await tx.comparisonItem.count({ where: owner });
      if (count >= MAX_COMPARISON_ITEMS) {
        throw new ApiError(409, 'COMPARISON_LIMIT_REACHED', 'Салыстыруға ең көбі 4 тауар қосуға болады');
      }
      return tx.comparisonItem.create({ data: { ...identity, productId } });
    },
    { isolationLevel: 'Serializable' },
  );
};

const getComparison = async (identity, language) => {
  const items = await prisma.comparisonItem.findMany({
    where: { ...ownerWhere(identity), product: { isActive: true } },
    include: {
      product: {
        include: {
          brand: true,
          category: true,
          images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
          attributeValues: { include: { attributeDefinition: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const products = items.map(({ product }) => ({
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    name: getLocalizedValue(product, 'name', language),
    brand: product.brand?.name || null,
    category: getLocalizedValue(product.category, 'name', language),
    image: product.images[0]?.url || null,
  }));
  const attributeMap = new Map();
  for (const { product } of items) {
    for (const entry of product.attributeValues) {
      const definition = entry.attributeDefinition;
      if (!attributeMap.has(definition.key)) {
        attributeMap.set(definition.key, {
          key: definition.key,
          name: getLocalizedValue(definition, 'name', language),
          type: definition.type,
          unit: definition.unit,
          sortOrder: definition.sortOrder,
          values: {},
        });
      }
      const value =
        definition.type === 'NUMBER'
          ? entry.numberValue === null
            ? null
            : Number(entry.numberValue)
          : definition.type === 'BOOLEAN'
            ? entry.booleanValue
            : entry.textValue;
      attributeMap.get(definition.key).values[product.id] = value;
    }
  }
  const attributes = [...attributeMap.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder, ...attribute }) => attribute);
  return { products, attributes, count: products.length, maximum: MAX_COMPARISON_ITEMS };
};

const removeItem = (identity, productId) =>
  prisma.comparisonItem.deleteMany({ where: { ...ownerWhere(identity), productId } });
const clear = (identity) =>
  prisma.comparisonItem.deleteMany({ where: ownerWhere(identity) });

module.exports = { addItem, getComparison, removeItem, clear };

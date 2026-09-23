const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { getLocalizedValue } = require('../../utils/localization');

const listFavorites = async (userId, language) => {
  const favorites = await prisma.favorite.findMany({
    where: { userId, product: { isActive: true } },
    include: {
      product: {
        include: {
          brand: true,
          category: true,
          images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return favorites.map((favorite) => ({
    id: favorite.id,
    createdAt: favorite.createdAt,
    product: {
      id: favorite.product.id,
      sku: favorite.product.sku,
      slug: favorite.product.slug,
      name: getLocalizedValue(favorite.product, 'name', language),
      brand: favorite.product.brand
        ? { id: favorite.product.brand.id, slug: favorite.product.brand.slug, name: favorite.product.brand.name }
        : null,
      category: {
        id: favorite.product.category.id,
        slug: favorite.product.category.slug,
        name: getLocalizedValue(favorite.product.category, 'name', language),
      },
      image: favorite.product.images[0]?.url || null,
    },
  }));
};

const addFavorite = async (userId, productId) => {
  const product = await prisma.product.findFirst({ where: { id: productId, isActive: true } });
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Тауар табылмады');
  const existing = await prisma.favorite.findUnique({
    where: { userId_productId: { userId, productId } },
  });
  if (existing) return existing;
  return prisma.favorite.create({ data: { userId, productId } });
};

const removeFavorite = (userId, productId) =>
  prisma.favorite.deleteMany({ where: { userId, productId } });

module.exports = { listFavorites, addFavorite, removeFavorite };

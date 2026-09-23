const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { getPagination, buildPagination } = require('../../utils/pagination');
const { getLocalizedValue } = require('../../utils/localization');
const { findActiveCity } = require('../cities/city.service');
const {
  calculateWarehouseAvailableStock,
  calculateCityAvailableStock,
} = require('./product.service');

const DEFAULT_CITY_SLUG = 'almaty';
const PRICE_SORTS = new Set(['price_asc', 'price_desc']);

const parseAttributeFilters = (rawAttributes) => {
  if (!rawAttributes) return [];
  const filters = String(rawAttributes)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(':');
      if (separatorIndex < 1 || separatorIndex === entry.length - 1) {
        throw new ApiError(
          422,
          'INVALID_ATTRIBUTE_FILTER',
          'attributes пішімі key:value болуы керек',
        );
      }
      return {
        key: entry.slice(0, separatorIndex).trim(),
        value: entry.slice(separatorIndex + 1).trim(),
      };
    });

  if (filters.length > 20) {
    throw new ApiError(422, 'TOO_MANY_ATTRIBUTE_FILTERS', '20-дан көп атрибут сүзгісіне рұқсат жоқ');
  }
  return filters;
};

const resolveCatalogCity = async (requestedSlug, useDefault = false, db = prisma) => {
  const slug = requestedSlug || (useDefault ? DEFAULT_CITY_SLUG : null);
  if (!slug) return null;
  const city = await db.city.findFirst({ where: { slug, isActive: true } });
  if (!city) throw new ApiError(404, 'CITY_NOT_FOUND', 'Қала табылмады');
  return city;
};

const getCityStock = async (productId, cityId, db = prisma) => {
  const stocks = await db.productStock.findMany({
    where: { productId, warehouse: { cityId, isActive: true } },
    include: { warehouse: true },
    orderBy: { warehouse: { name: 'asc' } },
  });
  return {
    availableQuantity: calculateCityAvailableStock(stocks),
    stocks: stocks.map((stock) => ({
      ...stock,
      availableQuantity: calculateWarehouseAvailableStock(stock),
    })),
  };
};

const getCityStocks = async (productIds, cityId, db = prisma) => {
  const totals = new Map(productIds.map((id) => [id, 0]));
  if (!cityId || productIds.length === 0) return totals;
  const stocks = await db.productStock.findMany({
    where: { productId: { in: productIds }, warehouse: { cityId, isActive: true } },
    select: { productId: true, quantity: true, reserved: true },
  });
  for (const stock of stocks) {
    totals.set(
      stock.productId,
      (totals.get(stock.productId) || 0) + calculateWarehouseAvailableStock(stock),
    );
  }
  return totals;
};

const getCityPrice = (productId, cityId, db = prisma) =>
  db.productOffer.findFirst({
    where: { productId, cityId, isActive: true, product: { isActive: true } },
  });

const serializeCard = (product, language, city, stockTotals) => {
  const offer = product.offers?.[0] || null;
  return {
    id: product.id,
    sku: product.sku,
    supplierSku: product.supplierSku,
    slug: product.slug,
    name: getLocalizedValue(product, 'name', language),
    shortDescription: getLocalizedValue(product, 'shortDescription', language),
    unit: product.unit,
    brand: product.brand
      ? {
          id: product.brand.id,
          slug: product.brand.slug,
          name: product.brand.name,
          logoUrl: product.brand.logoUrl,
        }
      : null,
    category: {
      id: product.category.id,
      slug: product.category.slug,
      name: getLocalizedValue(product.category, 'name', language),
    },
    image: product.images?.[0]
      ? {
          url: product.images[0].url,
          alt: getLocalizedValue(product.images[0], 'alt', language),
        }
      : null,
    cityOffer: offer
      ? {
          id: offer.id,
          webPrice: Number(offer.webPrice),
          storePrice: offer.storePrice === null ? null : Number(offer.storePrice),
          availabilityStatus: offer.availabilityStatus,
          deliveryEstimateHours: offer.deliveryEstimateHours,
        }
      : null,
    availableQuantity: city ? stockTotals.get(product.id) || 0 : null,
    availabilityStatus: offer?.availabilityStatus || null,
    isNew: product.isNew,
    isSpecialOffer: product.isSpecialOffer,
    isPopular: product.isPopular,
    popularity: product.popularity,
    createdAt: product.createdAt,
  };
};

const buildAttributeWhere = ({ key, value }) => {
  const numeric = Number(value);
  const boolean = value.toLowerCase() === 'true' ? true : value.toLowerCase() === 'false' ? false : null;
  const valueConditions = [{ textValue: { equals: value, mode: 'insensitive' } }];
  if (Number.isFinite(numeric)) valueConditions.push({ numberValue: { equals: numeric } });
  if (boolean !== null) valueConditions.push({ booleanValue: boolean });
  return {
    attributeValues: {
      some: {
        attributeDefinition: { key },
        OR: valueConditions,
      },
    },
  };
};

const sortCards = (cards, sort, language) => {
  const locale = language === 'ru' ? 'ru-RU' : 'kk-KZ';
  const comparePrice = (left, right, direction) => {
    const leftPrice = left.cityOffer?.webPrice;
    const rightPrice = right.cityOffer?.webPrice;
    if (leftPrice === undefined || leftPrice === null) return 1;
    if (rightPrice === undefined || rightPrice === null) return -1;
    return direction * (leftPrice - rightPrice);
  };
  const sorters = {
    name_asc: (a, b) => a.name.localeCompare(b.name, locale),
    name_desc: (a, b) => b.name.localeCompare(a.name, locale),
    price_asc: (a, b) => comparePrice(a, b, 1),
    price_desc: (a, b) => comparePrice(a, b, -1),
    popularity_asc: (a, b) => a.popularity - b.popularity,
    popularity_desc: (a, b) => b.popularity - a.popularity,
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    default: (a, b) => b.popularity - a.popularity || new Date(b.createdAt) - new Date(a.createdAt),
  };
  return cards.sort(sorters[sort] || sorters.default);
};

const searchProducts = async ({ query, language }) => {
  const { page, limit, skip } = getPagination(query);
  const sort = query.sort || 'default';
  const needsCity =
    Boolean(query.city) ||
    query.inStock !== undefined ||
    query.minPrice !== undefined ||
    query.maxPrice !== undefined ||
    PRICE_SORTS.has(sort);
  const city = await resolveCatalogCity(query.city, needsCity);
  const attributeFilters = parseAttributeFilters(query.attributes);
  const term = query.q?.trim();

  const offerWhere = city
    ? {
        cityId: city.id,
        isActive: true,
        ...(query.minPrice !== undefined ? { webPrice: { gte: query.minPrice } } : {}),
      }
    : null;
  if (offerWhere && query.maxPrice !== undefined) {
    offerWhere.webPrice = { ...(offerWhere.webPrice || {}), lte: query.maxPrice };
  }

  const where = {
    isActive: true,
    category: { isActive: true, ...(query.category ? { slug: query.category } : {}) },
    ...(query.brand ? { brand: { is: { slug: query.brand, isActive: true } } } : {}),
    ...(query.isNew !== undefined ? { isNew: query.isNew } : {}),
    ...(query.isSpecialOffer !== undefined ? { isSpecialOffer: query.isSpecialOffer } : {}),
    ...(offerWhere ? { offers: { some: offerWhere } } : {}),
    ...(term
      ? {
          OR: [
            { sku: { contains: term, mode: 'insensitive' } },
            { supplierSku: { contains: term, mode: 'insensitive' } },
            { nameKk: { contains: term, mode: 'insensitive' } },
            { nameRu: { contains: term, mode: 'insensitive' } },
            { brand: { is: { name: { contains: term, mode: 'insensitive' } } } },
          ],
        }
      : {}),
    ...(attributeFilters.length ? { AND: attributeFilters.map(buildAttributeWhere) } : {}),
  };

  const products = await prisma.product.findMany({
    where,
    include: {
      category: true,
      brand: true,
      images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
      ...(city
        ? { offers: { where: { cityId: city.id, isActive: true }, take: 1 } }
        : {}),
    },
  });
  const stockTotals = await getCityStocks(
    products.map((product) => product.id),
    city?.id,
  );
  let cards = products.map((product) => serializeCard(product, language, city, stockTotals));
  if (query.inStock === true) {
    cards = cards.filter((product) => product.availableQuantity > 0);
  } else if (query.inStock === false) {
    cards = cards.filter((product) => product.availableQuantity === 0);
  }
  sortCards(cards, sort, language);
  const total = cards.length;
  return {
    data: cards.slice(skip, skip + limit),
    pagination: buildPagination(page, limit, total),
  };
};

const getProductBySku = (sku) =>
  prisma.product.findFirst({ where: { sku, isActive: true } });

const getProductSpecifications = async (productId, language, db = prisma) => {
  const values = await db.productAttributeValue.findMany({
    where: { productId },
    include: { attributeDefinition: true },
  });
  return values
    .map((entry) => {
      const definition = entry.attributeDefinition;
      const value =
        definition.type === 'NUMBER'
          ? entry.numberValue === null
            ? null
            : Number(entry.numberValue)
          : definition.type === 'BOOLEAN'
            ? entry.booleanValue
            : entry.textValue;
      return {
        key: definition.key,
        name: getLocalizedValue(definition, 'name', language),
        type: definition.type,
        unit: definition.unit,
        value,
        sortOrder: definition.sortOrder,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder, ...item }) => item);
};

const findRelatedProducts = async ({ productId, citySlug, language, limit = 8 }) => {
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true },
    select: { id: true, categoryId: true, brandId: true },
  });
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Тауар табылмады');
  const city = await resolveCatalogCity(citySlug, Boolean(citySlug));
  const candidates = await prisma.product.findMany({
    where: { id: { not: product.id }, categoryId: product.categoryId, isActive: true },
    include: {
      category: true,
      brand: true,
      images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1 },
      ...(city ? { offers: { where: { cityId: city.id, isActive: true }, take: 1 } } : {}),
    },
    take: 50,
  });
  const totals = await getCityStocks(candidates.map((item) => item.id), city?.id);
  return candidates
    .map((item) => serializeCard(item, language, city, totals))
    .sort((a, b) => {
      const sameBrandA = a.brand?.id === product.brandId ? 1 : 0;
      const sameBrandB = b.brand?.id === product.brandId ? 1 : 0;
      const availableA = a.cityOffer && a.availableQuantity > 0 ? 1 : 0;
      const availableB = b.cityOffer && b.availableQuantity > 0 ? 1 : 0;
      return sameBrandB - sameBrandA || availableB - availableA || b.popularity - a.popularity;
    })
    .slice(0, limit);
};

module.exports = {
  searchProducts,
  getProductBySku,
  getProductSpecifications,
  getCityStock,
  getCityStocks,
  getCityPrice,
  findRelatedProducts,
  resolveCatalogCity,
  serializeCard,
  parseAttributeFilters,
};

const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { getPagination, buildPagination } = require('../../utils/pagination');
const { getLocalizedValue } = require('../../utils/localization');
const { findActiveCity } = require('../cities/city.service');

const DEFAULT_CITY_SLUG = 'almaty';

const assertValidStock = ({ quantity, reserved }) => {
  if (quantity < 0 || reserved < 0 || reserved > quantity) {
    throw new ApiError(
      500,
      'STOCK_DATA_INTEGRITY_ERROR',
      'Қоймадағы қалдық деректері дұрыс емес',
    );
  }
};

const calculateWarehouseAvailableStock = (stock) => {
  assertValidStock(stock);
  return stock.quantity - stock.reserved;
};

const calculateCityAvailableStock = (stocks) =>
  stocks.reduce((total, stock) => total + calculateWarehouseAvailableStock(stock), 0);

const serializeOffer = (offer) => {
  if (!offer) return null;
  return {
    id: offer.id,
    webPrice: Number(offer.webPrice),
    storePrice: offer.storePrice === null ? null : Number(offer.storePrice),
    availabilityStatus: offer.availabilityStatus,
    deliveryEstimateHours: offer.deliveryEstimateHours,
  };
};

const serializeCategory = (category, language) => ({
  id: category.id,
  slug: category.slug,
  name: getLocalizedValue(category, 'name', language),
});

const serializeBrand = (brand) =>
  brand
    ? {
        id: brand.id,
        slug: brand.slug,
        name: brand.name,
        logoUrl: brand.logoUrl,
      }
    : null;

const resolveCity = async (requestedSlug, useDefault = false) => {
  const slug = requestedSlug || (useDefault ? DEFAULT_CITY_SLUG : null);
  if (!slug) return null;

  const city = await findActiveCity(slug);
  if (!city && requestedSlug) {
    throw new ApiError(404, 'CITY_NOT_FOUND', 'Қала табылмады');
  }
  return city;
};

const getStockTotals = async (productIds, cityId) => {
  const totals = new Map(productIds.map((id) => [id, 0]));
  if (!cityId || productIds.length === 0) return totals;

  const stocks = await prisma.productStock.findMany({
    where: {
      productId: { in: productIds },
      warehouse: { cityId, isActive: true },
    },
    select: { productId: true, quantity: true, reserved: true },
  });

  for (const stock of stocks) {
    const available = calculateWarehouseAvailableStock(stock);
    totals.set(stock.productId, (totals.get(stock.productId) || 0) + available);
  }

  return totals;
};

const buildProductWhere = ({ q, category, brand, cityId }) => {
  const term = q?.trim();
  return {
    isActive: true,
    category: {
      isActive: true,
      ...(category ? { slug: category } : {}),
    },
    ...(brand
      ? {
          brand: {
            is: { slug: brand, isActive: true },
          },
        }
      : {}),
    ...(cityId
      ? {
          offers: { some: { cityId, isActive: true } },
        }
      : {}),
    ...(term
      ? {
          OR: [
            { sku: { contains: term, mode: 'insensitive' } },
            { supplierSku: { contains: term, mode: 'insensitive' } },
            { nameKk: { contains: term, mode: 'insensitive' } },
            { nameRu: { contains: term, mode: 'insensitive' } },
            { shortDescriptionKk: { contains: term, mode: 'insensitive' } },
            { shortDescriptionRu: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
};

const listProducts = async ({ query, language }) => {
  const { page, limit, skip } = getPagination(query);
  const city = await resolveCity(query.city);
  const where = buildProductWhere({
    q: query.q,
    category: query.category,
    brand: query.brand,
    cityId: city?.id,
  });

  const include = {
    category: true,
    brand: true,
    images: {
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
      take: 1,
    },
  };
  if (city) {
    include.offers = {
      where: { cityId: city.id, isActive: true },
      take: 1,
    };
  }

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include,
      orderBy: [{ popularity: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  const stockTotals = await getStockTotals(
    products.map((product) => product.id),
    city?.id,
  );

  const data = products.map((product) => {
    const offer = product.offers?.[0] || null;
    return {
      id: product.id,
      sku: product.sku,
      supplierSku: product.supplierSku,
      slug: product.slug,
      name: getLocalizedValue(product, 'name', language),
      shortDescription: getLocalizedValue(product, 'shortDescription', language),
      unit: product.unit,
      brand: serializeBrand(product.brand),
      category: serializeCategory(product.category, language),
      image: product.images[0]
        ? {
            url: product.images[0].url,
            alt: getLocalizedValue(product.images[0], 'alt', language),
          }
        : null,
      cityOffer: serializeOffer(offer),
      availableQuantity: city ? stockTotals.get(product.id) || 0 : null,
      availabilityStatus: offer?.availabilityStatus || null,
      isNew: product.isNew,
      isSpecialOffer: product.isSpecialOffer,
      isPopular: product.isPopular,
    };
  });

  return { data, pagination: buildPagination(page, limit, total) };
};

const serializeAttributeValue = (attributeValue, language) => {
  const definition = attributeValue.attributeDefinition;
  let value = attributeValue.textValue;

  if (definition.type === 'NUMBER') {
    value = attributeValue.numberValue === null ? null : Number(attributeValue.numberValue);
  } else if (definition.type === 'BOOLEAN') {
    value = attributeValue.booleanValue;
  }

  return {
    key: definition.key,
    name: getLocalizedValue(definition, 'name', language),
    type: definition.type,
    unit: definition.unit,
    value,
    sortOrder: definition.sortOrder,
  };
};

const getProductBySlug = async ({ slug, citySlug, language }) => {
  const city = await resolveCity(citySlug, true);
  const include = {
    category: true,
    brand: true,
    images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
    attributeValues: { include: { attributeDefinition: true } },
  };
  if (city) {
    include.offers = {
      where: { cityId: city.id, isActive: true },
      take: 1,
    };
  }

  const product = await prisma.product.findFirst({
    where: { slug, isActive: true, category: { isActive: true } },
    include,
  });

  if (!product) {
    throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Тауар табылмады');
  }

  const stockTotals = await getStockTotals([product.id], city?.id);
  const offer = product.offers?.[0] || null;
  const technicalSpecifications = product.attributeValues
    .map((value) => serializeAttributeValue(value, language))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ sortOrder, ...specification }) => specification);

  return {
    id: product.id,
    sku: product.sku,
    supplierSku: product.supplierSku,
    slug: product.slug,
    name: getLocalizedValue(product, 'name', language),
    description: getLocalizedValue(product, 'description', language),
    brand: serializeBrand(product.brand),
    category: serializeCategory(product.category, language),
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: getLocalizedValue(image, 'alt', language),
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
    })),
    technicalSpecifications,
    city: city
      ? { id: city.id, slug: city.slug, name: getLocalizedValue(city, 'name', language) }
      : null,
    cityOffer: serializeOffer(offer),
    availableQuantity: city ? stockTotals.get(product.id) || 0 : 0,
    availabilityStatus: offer?.availabilityStatus || 'OUT_OF_STOCK',
    certificateUrl: product.certificateUrl,
    manualUrl: product.manualUrl,
    isNew: product.isNew,
    isSpecialOffer: product.isSpecialOffer,
    isPopular: product.isPopular,
  };
};

const getProductAvailability = async ({ productId, citySlug, language }) => {
  const city = await resolveCity(citySlug, true);
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true },
    select: { id: true, sku: true },
  });

  if (!product) {
    throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Тауар табылмады');
  }

  if (!city) {
    return {
      productId: product.id,
      sku: product.sku,
      city: null,
      offer: null,
      availableQuantity: 0,
      availabilityStatus: 'OUT_OF_STOCK',
      warehouses: [],
    };
  }

  const [offer, stocks] = await Promise.all([
    prisma.productOffer.findFirst({
      where: { productId, cityId: city.id, isActive: true },
    }),
    prisma.productStock.findMany({
      where: {
        productId,
        warehouse: { cityId: city.id, isActive: true },
      },
      include: { warehouse: { include: { branch: true } } },
      orderBy: { warehouse: { name: 'asc' } },
    }),
  ]);

  const warehouses = stocks.map((stock) => ({
    id: stock.warehouse.id,
    code: stock.warehouse.code,
    name: stock.warehouse.name,
    branchId: stock.warehouse.branchId,
    availableQuantity: calculateWarehouseAvailableStock(stock),
  }));

  return {
    productId: product.id,
    sku: product.sku,
    city: {
      id: city.id,
      slug: city.slug,
      name: getLocalizedValue(city, 'name', language),
    },
    offer: serializeOffer(offer),
    availableQuantity: calculateCityAvailableStock(stocks),
    availabilityStatus: offer?.availabilityStatus || 'OUT_OF_STOCK',
    warehouses,
  };
};

module.exports = {
  listProducts,
  getProductBySlug,
  getProductAvailability,
  assertValidStock,
  calculateWarehouseAvailableStock,
  calculateCityAvailableStock,
};

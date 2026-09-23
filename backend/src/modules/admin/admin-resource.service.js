const { Prisma } = require('@prisma/client');
const prisma = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const resources = require('./admin-resource.config');
const { buildPagination } = require('../../utils/pagination');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_FIELDS = new Set([
  'cityId', 'branchId', 'parentId', 'categoryId', 'brandId', 'productId',
  'attributeDefinitionId', 'warehouseId',
]);
const BOOLEAN_FIELDS = new Set([
  'isActive', 'isNew', 'isSpecialOffer', 'isPopular', 'isPrimary', 'filterable',
  'sortable', 'booleanValue', 'isPublished',
]);
const INTEGER_FIELDS = new Set([
  'sortOrder', 'popularity', 'deliveryEstimateHours', 'quantity', 'reserved', 'estimatedHours',
]);
const DECIMAL_FIELDS = new Set([
  'latitude', 'longitude', 'numberValue', 'webPrice', 'storePrice',
  'minimumFreeDeliveryAmount', 'deliveryPrice',
]);
const DATE_FIELDS = new Set(['startsAt', 'endsAt', 'publishedAt']);
const URL_FIELDS = new Set(['imageUrl', 'logoUrl', 'certificateUrl', 'manualUrl', 'url']);
const ENUM_FIELDS = {
  type: ['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT'],
  availabilityStatus: ['IN_STOCK', 'ON_ORDER', 'OUT_OF_STOCK'],
};

const getConfig = (resource) => {
  const config = resources[resource];
  if (!config) throw new ApiError(404, 'ADMIN_RESOURCE_NOT_FOUND', 'Admin ресурсы табылмады');
  return config;
};

const sanitizeValue = (field, value) => {
  if (value === null) return null;
  if (UUID_FIELDS.has(field)) {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw new ApiError(422, 'INVALID_UUID', `${field} UUID болуы керек`);
    }
    return value;
  }
  if (BOOLEAN_FIELDS.has(field)) {
    if (typeof value !== 'boolean') throw new ApiError(422, 'INVALID_BOOLEAN', `${field} boolean болуы керек`);
    return value;
  }
  if (INTEGER_FIELDS.has(field)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new ApiError(422, 'INVALID_INTEGER', `${field} нөлден кем емес бүтін сан болуы керек`);
    }
    return value;
  }
  if (DECIMAL_FIELDS.has(field)) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw new ApiError(422, 'INVALID_DECIMAL', `${field} нөлден кем емес сан болуы керек`);
    }
    return new Prisma.Decimal(String(value));
  }
  if (DATE_FIELDS.has(field)) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new ApiError(422, 'INVALID_DATE', `${field} күні дұрыс емес`);
    return date;
  }
  if (ENUM_FIELDS[field]) {
    if (!ENUM_FIELDS[field].includes(value)) {
      throw new ApiError(422, 'INVALID_ENUM_VALUE', `${field} мәні қолдау көрсетілмейді`);
    }
    return value;
  }
  if (typeof value !== 'string') {
    throw new ApiError(422, 'INVALID_STRING', `${field} мәтін болуы керек`);
  }
  const cleaned = value.trim();
  if (cleaned.length > 20000) throw new ApiError(422, 'VALUE_TOO_LONG', `${field} тым ұзын`);
  if (URL_FIELDS.has(field) && cleaned && !/^https?:\/\//i.test(cleaned) && !cleaned.startsWith('/api/uploads/')) {
    throw new ApiError(422, 'INVALID_URL', `${field} URL мәні дұрыс емес`);
  }
  return cleaned;
};

const prepareData = (config, payload, creating) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(422, 'INVALID_BODY', 'JSON object қажет');
  }
  const unknown = Object.keys(payload).filter((field) => !config.fields.includes(field));
  if (unknown.length) {
    throw new ApiError(422, 'UNKNOWN_FIELDS', 'Рұқсат етілмеген өрістер бар', unknown);
  }
  if (creating) {
    const missing = config.required.filter(
      (field) => payload[field] === undefined || payload[field] === null || payload[field] === '',
    );
    if (missing.length) throw new ApiError(422, 'REQUIRED_FIELDS_MISSING', 'Міндетті өрістер жоқ', missing);
  }
  const data = {};
  Object.entries(payload).forEach(([field, value]) => {
    data[field] = sanitizeValue(field, value);
  });
  if (Object.keys(data).length === 0) throw new ApiError(422, 'EMPTY_UPDATE', 'Өзгертілетін өріс жоқ');
  return data;
};

const validateIntegrity = async (resource, data, current) => {
  if (resource === 'stock') {
    const quantity = data.quantity ?? current?.quantity ?? 0;
    const reserved = data.reserved ?? current?.reserved ?? 0;
    if (reserved > quantity) {
      throw new ApiError(422, 'INVALID_STOCK', 'reserved quantity мәнінен аспауы керек');
    }
  }
  if (resource === 'attribute-values') {
    const productId = data.productId ?? current?.productId;
    const definitionId = data.attributeDefinitionId ?? current?.attributeDefinitionId;
    const [product, definition] = await Promise.all([
      prisma.product.findUnique({ where: { id: productId } }),
      prisma.attributeDefinition.findUnique({ where: { id: definitionId } }),
    ]);
    if (!product || !definition || product.categoryId !== definition.categoryId) {
      throw new ApiError(422, 'ATTRIBUTE_CATEGORY_MISMATCH', 'Атрибут тауар санатына сәйкес емес');
    }
    const merged = { ...current, ...data };
    const expected = {
      TEXT: 'textValue',
      SELECT: 'textValue',
      NUMBER: 'numberValue',
      BOOLEAN: 'booleanValue',
    }[definition.type];
    if (merged[expected] === null || merged[expected] === undefined) {
      throw new ApiError(422, 'ATTRIBUTE_VALUE_REQUIRED', `${expected} қажет`);
    }
  }
};

const listResource = async (resource, { page, limit }) => {
  const config = getConfig(resource);
  const skip = (page - 1) * limit;
  const delegate = prisma[config.model];
  const [data, total] = await prisma.$transaction([
    delegate.findMany({ orderBy: { id: 'desc' }, skip, take: limit }),
    delegate.count(),
  ]);
  return { data, pagination: buildPagination(page, limit, total) };
};

const getResource = async (resource, id) => {
  const config = getConfig(resource);
  const data = await prisma[config.model].findUnique({ where: { id } });
  if (!data) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Ресурс табылмады');
  return data;
};

const createResource = async (resource, payload) => {
  const config = getConfig(resource);
  const data = prepareData(config, payload, true);
  await validateIntegrity(resource, data, null);
  return prisma[config.model].create({ data });
};

const updateResource = async (resource, id, payload) => {
  const config = getConfig(resource);
  const current = await getResource(resource, id);
  const data = prepareData(config, payload, false);
  await validateIntegrity(resource, data, current);
  return prisma[config.model].update({ where: { id }, data });
};

const deleteResource = async (resource, id) => {
  const config = getConfig(resource);
  await getResource(resource, id);
  if (config.softDelete) {
    return prisma[config.model].update({ where: { id }, data: { [config.softDelete]: false } });
  }
  return prisma[config.model].delete({ where: { id } });
};

module.exports = {
  resources,
  listResource,
  getResource,
  createResource,
  updateResource,
  deleteResource,
};

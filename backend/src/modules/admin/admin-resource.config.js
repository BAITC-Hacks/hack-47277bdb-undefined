const resources = {
  cities: {
    model: 'city',
    required: ['slug', 'nameKk', 'nameRu'],
    fields: ['slug', 'nameKk', 'nameRu', 'isActive'],
    softDelete: 'isActive',
  },
  branches: {
    model: 'branch',
    required: ['cityId', 'nameKk', 'nameRu'],
    fields: [
      'cityId', 'nameKk', 'nameRu', 'addressKk', 'addressRu', 'phone1', 'phone2',
      'email', 'workingHoursKk', 'workingHoursRu', 'latitude', 'longitude', 'isActive',
    ],
    softDelete: 'isActive',
  },
  warehouses: {
    model: 'warehouse',
    required: ['cityId', 'name', 'code'],
    fields: ['cityId', 'branchId', 'name', 'code', 'isActive'],
    softDelete: 'isActive',
  },
  categories: {
    model: 'category',
    required: ['slug', 'nameKk', 'nameRu'],
    fields: [
      'parentId', 'slug', 'nameKk', 'nameRu', 'descriptionKk', 'descriptionRu',
      'imageUrl', 'sortOrder', 'isActive',
    ],
    softDelete: 'isActive',
  },
  brands: {
    model: 'brand',
    required: ['slug', 'name'],
    fields: ['slug', 'name', 'logoUrl', 'descriptionKk', 'descriptionRu', 'isActive'],
    softDelete: 'isActive',
  },
  products: {
    model: 'product',
    required: ['sku', 'slug', 'nameKk', 'nameRu', 'categoryId', 'unit'],
    fields: [
      'sku', 'supplierSku', 'slug', 'nameKk', 'nameRu', 'shortDescriptionKk',
      'shortDescriptionRu', 'descriptionKk', 'descriptionRu', 'categoryId', 'brandId',
      'unit', 'isActive', 'isNew', 'isSpecialOffer', 'isPopular', 'popularity',
      'certificateUrl', 'manualUrl',
    ],
    softDelete: 'isActive',
  },
  'product-images': {
    model: 'productImage',
    required: ['productId', 'url'],
    fields: ['productId', 'url', 'altKk', 'altRu', 'sortOrder', 'isPrimary'],
  },
  'attribute-definitions': {
    model: 'attributeDefinition',
    required: ['categoryId', 'key', 'nameKk', 'nameRu', 'type'],
    fields: [
      'categoryId', 'key', 'nameKk', 'nameRu', 'type', 'unit', 'filterable',
      'sortable', 'sortOrder',
    ],
  },
  'attribute-values': {
    model: 'productAttributeValue',
    required: ['productId', 'attributeDefinitionId'],
    fields: ['productId', 'attributeDefinitionId', 'textValue', 'numberValue', 'booleanValue'],
  },
  'product-offers': {
    model: 'productOffer',
    required: ['productId', 'cityId', 'webPrice'],
    fields: [
      'productId', 'cityId', 'webPrice', 'storePrice', 'availabilityStatus',
      'deliveryEstimateHours', 'isActive',
    ],
    softDelete: 'isActive',
  },
  stock: {
    model: 'productStock',
    required: ['productId', 'warehouseId', 'quantity'],
    fields: ['productId', 'warehouseId', 'quantity', 'reserved'],
  },
  promotions: {
    model: 'promotion',
    required: ['slug', 'titleKk', 'titleRu'],
    fields: [
      'slug', 'titleKk', 'titleRu', 'descriptionKk', 'descriptionRu', 'imageUrl',
      'startsAt', 'endsAt', 'isActive',
    ],
    softDelete: 'isActive',
  },
  news: {
    model: 'news',
    required: ['slug', 'titleKk', 'titleRu', 'contentKk', 'contentRu', 'publishedAt'],
    fields: [
      'slug', 'titleKk', 'titleRu', 'excerptKk', 'excerptRu', 'contentKk', 'contentRu',
      'imageUrl', 'publishedAt', 'isPublished',
    ],
    softDelete: 'isPublished',
  },
  faqs: {
    model: 'faq',
    required: ['questionKk', 'questionRu', 'answerKk', 'answerRu'],
    fields: ['questionKk', 'questionRu', 'answerKk', 'answerRu', 'sortOrder', 'isPublished'],
    softDelete: 'isPublished',
  },
  pages: {
    model: 'contentPage',
    required: ['slug', 'titleKk', 'titleRu', 'contentKk', 'contentRu'],
    fields: ['slug', 'titleKk', 'titleRu', 'contentKk', 'contentRu', 'isPublished'],
    softDelete: 'isPublished',
  },
  'delivery-rules': {
    model: 'deliveryRule',
    required: ['nameKk', 'nameRu'],
    fields: [
      'cityId', 'nameKk', 'nameRu', 'minimumFreeDeliveryAmount', 'deliveryPrice',
      'estimatedHours', 'isActive',
    ],
    softDelete: 'isActive',
  },
};

module.exports = resources;

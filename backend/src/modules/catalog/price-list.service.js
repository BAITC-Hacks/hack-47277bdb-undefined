const ExcelJS = require('exceljs');
const prisma = require('../../config/prisma');
const { resolveCatalogCity, getCityStocks } = require('../products/product-query.service');

const generatePriceList = async (citySlug) => {
  const city = await resolveCatalogCity(citySlug, true);
  const offers = await prisma.productOffer.findMany({
    where: { cityId: city.id, isActive: true, product: { isActive: true } },
    include: { product: { include: { brand: true, category: true } } },
    orderBy: { product: { nameKk: 'asc' } },
  });
  const stockTotals = await getCityStocks(
    offers.map((offer) => offer.productId),
    city.id,
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'EKT Store API';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Price List', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'SKU', key: 'sku', width: 20 },
    { header: 'Supplier article', key: 'supplierSku', width: 20 },
    { header: 'Атауы (қазақша)', key: 'nameKk', width: 40 },
    { header: 'Название (русский)', key: 'nameRu', width: 40 },
    { header: 'Brand', key: 'brand', width: 24 },
    { header: 'Category', key: 'category', width: 30 },
    { header: 'Web price', key: 'webPrice', width: 16 },
    { header: 'Store price', key: 'storePrice', width: 16 },
    { header: 'Availability', key: 'availability', width: 20 },
    { header: 'Available quantity', key: 'availableQuantity', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: 'A1', to: 'J1' };
  offers.forEach((offer) => {
    sheet.addRow({
      sku: offer.product.sku,
      supplierSku: offer.product.supplierSku,
      nameKk: offer.product.nameKk,
      nameRu: offer.product.nameRu,
      brand: offer.product.brand?.name || '',
      category: offer.product.category.nameKk,
      webPrice: Number(offer.webPrice),
      storePrice: offer.storePrice === null ? null : Number(offer.storePrice),
      availability: offer.availabilityStatus,
      availableQuantity: stockTotals.get(offer.productId) || 0,
    });
  });
  sheet.getColumn('webPrice').numFmt = '#,##0.00';
  sheet.getColumn('storePrice').numFmt = '#,##0.00';
  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, city };
};

module.exports = { generatePriceList };

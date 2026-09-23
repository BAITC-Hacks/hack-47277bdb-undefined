const catalogFilterService = require('./catalog-filter.service');
const priceListService = require('./price-list.service');

const filters = async (req, res) => {
  const data = await catalogFilterService.getCategoryFilters({
    slug: req.params.slug,
    citySlug: req.query.city,
    language: req.language,
  });
  return res.json({ success: true, data });
};

const priceList = async (req, res) => {
  const { buffer, city } = await priceListService.generatePriceList(req.query.city);
  const filename = `ekt-price-list-${city.slug}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(Buffer.from(buffer));
};

module.exports = { filters, priceList };

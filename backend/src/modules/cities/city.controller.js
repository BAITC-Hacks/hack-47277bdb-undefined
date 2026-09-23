const cityService = require('./city.service');

const list = async (req, res) => {
  const data = await cityService.listCities(req.language);
  return res.json({ success: true, data });
};

const getBySlug = async (req, res) => {
  const data = await cityService.getCityBySlug(req.params.slug, req.language);
  return res.json({ success: true, data });
};

module.exports = { list, getBySlug };

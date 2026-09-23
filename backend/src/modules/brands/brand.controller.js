const brandService = require('./brand.service');

const list = async (req, res) => {
  const data = await brandService.listBrands(req.language);
  return res.json({ success: true, data });
};

module.exports = { list };

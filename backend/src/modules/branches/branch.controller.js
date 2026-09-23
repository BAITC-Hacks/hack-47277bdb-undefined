const branchService = require('./branch.service');

const list = async (req, res) => {
  const data = await branchService.listBranches({
    citySlug: req.query.city,
    language: req.language,
  });
  return res.json({ success: true, data });
};

module.exports = { list };

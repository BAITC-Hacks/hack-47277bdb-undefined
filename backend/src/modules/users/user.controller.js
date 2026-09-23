const userService = require('./user.service');

const me = (req, res) => res.json({ success: true, data: req.user });

const updateMe = async (req, res) => {
  const data = await userService.updateUserProfile(req.user.id, req.body);
  return res.json({ success: true, data });
};

module.exports = { me, updateMe };

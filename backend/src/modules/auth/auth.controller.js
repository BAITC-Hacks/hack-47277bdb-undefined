const authService = require('./auth.service');

const register = async (req, res) => {
  const data = await authService.register(req.body);
  return res.status(201).json({ success: true, data });
};

const login = async (req, res) => {
  const data = await authService.login(req.body);
  return res.json({ success: true, data });
};

const me = async (req, res) => res.json({ success: true, data: req.user });

module.exports = { register, login, me };

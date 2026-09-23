const jwt = require('jsonwebtoken');
const env = require('../config/env');

const signToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, algorithm: 'HS256' },
  );

const verifyToken = (token) => {
  const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  if (
    typeof payload !== 'object' ||
    typeof payload.sub !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)
  ) {
    throw new jwt.JsonWebTokenError('Invalid token subject');
  }
  return payload;
};

module.exports = { signToken, verifyToken };

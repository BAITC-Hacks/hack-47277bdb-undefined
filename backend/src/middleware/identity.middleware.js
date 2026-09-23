const ApiError = require('../utils/apiError');

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const identityMiddleware = (req, res, next) => {
  if (req.user) {
    req.identity = { userId: req.user.id, sessionId: null };
    return next();
  }

  const sessionId = req.get('x-session-id')?.trim();
  if (!sessionId) {
    return next(
      new ApiError(
        400,
        'SESSION_ID_REQUIRED',
        'Қонақ сұрауы үшін X-Session-Id тақырыбы қажет',
      ),
    );
  }
  if (!UUID_PATTERN.test(sessionId)) {
    return next(new ApiError(422, 'INVALID_SESSION_ID', 'X-Session-Id UUID болуы керек'));
  }

  req.identity = { userId: null, sessionId: sessionId.toLowerCase() };
  return next();
};

module.exports = identityMiddleware;

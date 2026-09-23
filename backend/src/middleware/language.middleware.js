const {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
} = require('../utils/localization');

const getAcceptedLanguage = (header = '') => {
  const candidates = header
    .split(',')
    .map((entry) => entry.trim().split(';')[0].toLowerCase().split('-')[0]);

  return candidates.find((candidate) => SUPPORTED_LANGUAGES.includes(candidate));
};

const languageMiddleware = (req, res, next) => {
  const queryLanguage = String(req.query.lang || '').toLowerCase();
  const language = SUPPORTED_LANGUAGES.includes(queryLanguage)
    ? queryLanguage
    : getAcceptedLanguage(req.get('accept-language')) || DEFAULT_LANGUAGE;

  req.language = language;
  res.setHeader('Content-Language', language);
  next();
};

module.exports = languageMiddleware;

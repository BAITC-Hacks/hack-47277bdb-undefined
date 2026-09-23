const SUPPORTED_LANGUAGES = ['kk', 'ru'];
const DEFAULT_LANGUAGE = 'kk';

const getLocalizedValue = (entity, field, language = DEFAULT_LANGUAGE) => {
  if (!entity) return null;

  const suffix = language === 'ru' ? 'Ru' : 'Kk';
  const fallbackSuffix = language === 'ru' ? 'Kk' : 'Ru';

  return entity[`${field}${suffix}`] ?? entity[`${field}${fallbackSuffix}`] ?? null;
};

const localizedEntity = (entity, language, fields = ['name', 'description']) => {
  if (!entity) return null;

  const localized = { ...entity };
  for (const field of fields) {
    localized[field] = getLocalizedValue(entity, field, language);
    delete localized[`${field}Kk`];
    delete localized[`${field}Ru`];
  }

  return localized;
};

module.exports = {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  getLocalizedValue,
  localizedEntity,
};

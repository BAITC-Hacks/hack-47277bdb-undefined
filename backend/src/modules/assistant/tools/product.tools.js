'use strict';

// Assistant adapters compose the same catalog services used by the public API.
// They never maintain a second catalog, calculate stock, or manufacture prices.
const catalog = require('../../products/product-query.service');
const products = require('../../products/product.service');
const categories = require('../../categories/category.service');
const brands = require('../../brands/brand.service');
const cities = require('../../cities/city.service');
const ApiError = require('../../../utils/apiError');

const DEFAULT_CITY = 'almaty';
const normalize = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е');
const words = (value) => normalize(value).match(/[\p{L}\p{N}]+/gu) || [];
const STOP_WORDS = new Set(words('мне нужен нужна нужно нужны надо хочу ищу найди найдите покажи покажите пожалуйста для и или товар товары купить маған керек керегі керекті табу табыңыз көрсетіңіз өтінемін үшін және немесе тауар тауарлар сатып алғым келеді бар барма қандай i need want find show please a an the for and or'));
const CATEGORY_HINTS = [
  ['rcbo', /дифавтомат|дифференциальн.*автомат|дифференциалды.*автомат|\brcbo\b/u],
  ['rcd', /узо|қорғаныстық ажырат|қорғаныш ажырат|\brcd\b/u],
  ['power-breakers', /силов.*автомат|күштік.*автомат/u],
  ['circuit-breakers', /автомат|автоматты ажыратқыш|circuit.?breaker/u],
  ['contactors', /контактор|пускател|түйістіргіш|contactor/u],
  ['relays', /реле|relay/u],
  ['flexible-wires', /пвс|шввп|гибк.*провод|икемді.*сым/u],
  ['power-cables', /кабель|кабел|cable/u],
  ['led-lamps', /ламп|шам|bulb/u],
  ['led-fixtures', /светильник|жарықтандырғыш|fixture/u],
  ['metal-enclosures', /металл.*щит|металл.*қалқан/u],
  ['modular-panels', /щит|қалқан|enclosure/u],
  ['sockets', /розетк|socket/u],
  ['switches', /выключател|ажыратқыш|switch/u],
  ['junction-boxes', /распределител.*короб|тарату.*қорап/u],
  ['cable-ducts', /кабель.канал|кабельдік арна/u],
  ['corrugated-conduits', /гофр|гофрленген/u],
  ['cable-trays', /лоток|науа/u],
  ['terminals', /клемм|terminal/u],
  ['power-supplies', /блок питан|қуат көзі|power.?suppl/u],
];
const CATEGORY_WORDS = new Set(words('автомат автоматы автоматты ажыратқыш автоматический выключатель кабель кабеля кабелей кабелі кабел сым лампа шам светильник розетка розетки контактор реле клемма клеммы щит қалқан узо дифавтомат circuit breaker cable contactor relay socket'));
const textFor = (language, kk, ru) => language === 'ru' ? ru : kk;
const boundedLimit = (value, fallback = 6) => Math.max(1, Math.min(20, Number.isInteger(value) ? value : fallback));
const toCity = (city) => ({ id: city.id, slug: city.slug, name: city.name });

const parseSearchQuery = (query, availableCategories = [], availableBrands = []) => {
  const original = String(query || '').trim().slice(0, 1000);
  const normalized = normalize(original);
  const attributes = {};
  // SKU/UUID segments are opaque identifiers, not electrical ratings. Preserve
  // them as search terms, but mask them while extracting typed measurements.
  const measurements = normalized.replace(/[\p{L}\p{N}._]*[-_][\p{L}\p{N}._-]+/gu, (identifier) => ' '.repeat(identifier.length));
  // Explicit conversational prefixes retain «Маған16А», while lexical
  // boundaries prevent AB16A, C16XYZ and UUID segments from becoming filters.
  const current = measurements.match(/(?:(?<![\p{L}\p{N}._-])|(?<=маған|мне|керек))(\d+(?:[.,]\d+)?)\s*[aа](?![\p{L}\p{N}_-]|\.[\p{L}\p{N}])/u);
  const curve = measurements.match(/(?<![\p{L}\p{N}._-])([bcdвсд])\s*(\d+(?:[.,]\d+)?)(?![\p{L}\p{N}_-]|\.[\p{L}\p{N}])/u);
  if (current) attributes.rated_current = Number(current[1].replace(',', '.'));
  if (curve) {
    // An explicitly stated amp rating takes precedence over a model token.
    if (!current) attributes.rated_current = Number(curve[2].replace(',', '.'));
    attributes.characteristic_curve = ({ в: 'B', с: 'C', д: 'D' }[curve[1]] || curve[1].toUpperCase());
  }
  const poles = measurements.match(/(?<![\p{L}\p{N}._-])(\d)\s*(?:[pр]|полюсті|полюс)(?![\p{L}\p{N}_-]|\.[\p{L}\p{N}])/u);
  if (poles) attributes.poles = Number(poles[1]);
  const cable = measurements.match(/(?<![\p{L}\p{N}._-])(\d+)\s*[xх×*]\s*(\d+(?:[.,]\d+)?)(?![\p{L}\p{N}_-]|\.[\p{L}\p{N}])/u);
  if (cable) {
    attributes.cores = Number(cable[1]);
    attributes.cross_section = Number(cable[2].replace(',', '.'));
  }
  // More specific phrases win over broad category words such as «автомат».
  const hint = CATEGORY_HINTS.find(([slug, pattern]) => pattern.test(normalized) && availableCategories.some((entry) => entry.slug === slug));
  const category = hint?.[0] || availableCategories.find((entry) => normalize(entry.name) === normalized)?.slug || null;
  const brand = availableBrands.find((entry) => normalized.includes(normalize(entry.name)) || normalized.includes(normalize(entry.slug)));
  let remaining = normalized;
  // The masked measurement text preserves offsets, so remove the actual match,
  // not an identical substring that happens to occur earlier inside an SKU.
  for (const match of [current, curve, poles, cable].filter(Boolean).sort((a, b) => b.index - a.index)) {
    remaining = `${remaining.slice(0, match.index)} ${remaining.slice(match.index + match[0].length)}`;
  }
  if (brand) remaining = remaining.replace(normalize(brand.name), ' ').replace(normalize(brand.slug), ' ');
  const terms = [...new Set(words(remaining).filter((term) => !STOP_WORDS.has(term) && (!category || !CATEGORY_WORDS.has(term)) && term.length > 1))];
  return { query: original, category, brand: brand?.slug || null, attributes, terms };
};

const getProduct = async ({ productId, sku, slug, citySlug = DEFAULT_CITY, language = 'kk' } = {}) => {
  let record;
  if (productId) {
    const availability = await products.getProductAvailability({ productId, citySlug, language });
    record = await catalog.getProductBySku(availability.sku);
  } else if (sku) record = await catalog.getProductBySku(sku);
  else if (slug) {
    const detail = await products.getProductBySlug({ slug, citySlug, language });
    record = await catalog.getProductBySku(detail.sku);
    return { ...detail, unit: record?.unit || null };
  } else throw new ApiError(422, 'PRODUCT_REFERENCE_REQUIRED', 'Provide productId, sku or slug.');
  if (!record) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  if ((sku && record.sku !== sku) || (slug && record.slug !== slug)) {
    throw new ApiError(422, 'CONFLICTING_PRODUCT_REFERENCE', 'Product references identify different products.');
  }
  const detail = await products.getProductBySlug({ slug: record.slug, citySlug, language });
  return { ...detail, unit: record.unit };
};

const searchProducts = async ({ query, message, citySlug = DEFAULT_CITY, language = 'kk', limit = 6 } = {}) => {
  const [city, categoryList, brandList] = await Promise.all([
    cities.getCityBySlug(citySlug, language), categories.listCategories(language), brands.listBrands(language),
  ]);
  const criteria = parseSearchQuery(query ?? message, categoryList, brandList);
  const selectedLimit = boundedLimit(limit);
  const base = {
    city: city.slug, category: criteria.category || undefined, brand: criteria.brand || undefined,
    attributes: Object.entries(criteria.attributes).map(([key, value]) => `${key}:${value}`).join(','),
    limit: 100, page: 1,
  };
  const hasCriteria = criteria.category || criteria.brand || base.attributes;
  if (!hasCriteria && !criteria.terms.length) return { products: [], criteria, city: toCity(city), total: 0, warnings: [] };
  // The catalog API deliberately searches literal substrings. Use meaningful
  // tokens and typed filters instead of forwarding an entire conversational sentence.
  const queries = hasCriteria ? [undefined] : criteria.terms.slice(0, 3);
  const resultSets = await Promise.all(queries.map((q) => catalog.searchProducts({ query: { ...base, q }, language })));
  const unique = new Map(resultSets.flatMap((result) => result.data).map((item) => [item.id, item]));
  const articleQuery = /^\S+$/.test(criteria.query) && /[-_]/.test(criteria.query) && /\d/.test(criteria.query) && /\p{L}/u.test(criteria.query);
  const scored = [...unique.values()].map((product) => {
    const skuText = normalize(`${product.sku} ${product.supplierSku || ''}`);
    const nameText = normalize(product.name);
    const allText = normalize(`${product.name} ${product.sku} ${product.supplierSku || ''} ${product.brand?.name || ''} ${product.shortDescription || ''}`);
    const matched = criteria.terms.filter((term) => allText.includes(term));
    const score = matched.reduce((total, term) => total + (skuText.includes(term) ? 4 : nameText.includes(term) ? 3 : 1), 0);
    return { product, score, matched: matched.length, articleMatches: allText.includes(normalize(criteria.query)) };
  }).filter(({ matched, articleMatches }) => articleQuery ? articleMatches : !criteria.terms.length || matched >= Math.ceil(criteria.terms.length / 2));
  scored.sort((a, b) => b.score - a.score || Number(b.product.availableQuantity > 0) - Number(a.product.availableQuantity > 0) || b.product.popularity - a.product.popularity);
  const warnings = resultSets.some((result) => result.pagination.total > result.data.length)
    ? [textFor(language, 'Іздеу ауқымы шектелген. Сұрауды модель немесе сипаттама арқылы нақтылаңыз.', 'Поиск ограничен выборкой. Уточните модель или характеристики.')] : [];
  return { products: scored.slice(0, selectedLimit).map(({ product }) => product), criteria, city: toCity(city), total: scored.length, warnings };
};

const PROFILES = {
  'circuit-breakers': ['rated_current', 'poles', 'characteristic_curve', 'rated_voltage', 'breaking_capacity'],
  'power-breakers': ['rated_current', 'poles', 'rated_voltage', 'breaking_capacity'],
  rcd: ['rated_current', 'poles', 'rated_voltage', 'residual_current'],
  rcbo: ['rated_current', 'poles', 'characteristic_curve', 'rated_voltage', 'residual_current', 'breaking_capacity'],
  contactors: ['rated_current', 'poles', 'coil_voltage', 'rated_voltage'],
  relays: ['coil_voltage', 'rated_current', 'rated_voltage'],
  'power-cables': ['cores', 'cross_section', 'conductor_material', 'insulation_material', 'rated_voltage'],
  'flexible-wires': ['cores', 'cross_section', 'conductor_material', 'insulation_material', 'rated_voltage'],
  'led-lamps': ['base_type', 'voltage', 'power', 'color_temperature', 'dimmable'],
  'led-fixtures': ['voltage', 'power', 'color_temperature', 'ip_protection'],
  'modular-panels': ['modules', 'rows', 'installation_type', 'ip_protection'],
  'metal-enclosures': ['dimensions', 'installation_type', 'ip_protection'],
  sockets: ['rated_current', 'rated_voltage', 'installation_type'],
  switches: ['rated_current', 'rated_voltage', 'installation_type'],
};
const valuesEqual = (a, b) => typeof a === 'number' && typeof b === 'number' ? a === b : normalize(a).trim() === normalize(b).trim();
const compareSpecifications = (source, candidate, categorySlug) => {
  const sourceMap = new Map(source.map((item) => [item.key, item]));
  const candidateMap = new Map(candidate.map((item) => [item.key, item]));
  const keys = PROFILES[categorySlug] || source.map((item) => item.key);
  const matchedAttributes = [], differences = [], missing = [], conflicts = [];
  for (const key of keys) {
    const expected = sourceMap.get(key), actual = candidateMap.get(key);
    if (expected?.value === null || expected?.value === undefined) { missing.push(key); continue; }
    if (actual?.value === null || actual?.value === undefined) { conflicts.push(key); continue; }
    // Higher rated voltage/breaking capacity is merely a catalog comparison,
    // never a guarantee that a part is suitable for a particular installation.
    const meets = ['rated_voltage', 'breaking_capacity'].includes(key) && typeof expected.value === 'number' && typeof actual.value === 'number'
      ? actual.value >= expected.value : valuesEqual(expected.value, actual.value);
    if (meets) matchedAttributes.push(key);
    else conflicts.push(key);
  }
  for (const [key, expected] of sourceMap) {
    const actual = candidateMap.get(key);
    if (actual && !valuesEqual(expected.value, actual.value)) differences.push(`${expected.name}: ${expected.value} → ${actual.value}${actual.unit ? ` ${actual.unit}` : ''}`);
  }
  return { matches: conflicts.length === 0, matchedAttributes, differences, missing, conflicts };
};

const findAlternatives = async ({ productId, sku, slug, citySlug = DEFAULT_CITY, language = 'kk', quantity = 1, limit = 4 } = {}) => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) throw new ApiError(422, 'INVALID_QUANTITY', 'quantity must be a positive integer.');
  const source = await getProduct({ productId, sku, slug, citySlug, language });
  const candidates = await catalog.findRelatedProducts({ productId: source.id, citySlug, language, limit: 100 });
  const available = candidates.filter((candidate) => candidate.cityOffer && candidate.availableQuantity >= quantity && candidate.availabilityStatus === 'IN_STOCK');
  const inspected = await Promise.all(available.map(async (product) => ({
    product, comparison: compareSpecifications(source.technicalSpecifications, await catalog.getProductSpecifications(product.id, language), source.category.slug),
  })));
  const warning = textFor(language,
    'Бұл — каталог сипаттамалары бойынша ұқсас нұсқалар, толық электрлік үйлесімділік кепілдігі емес. Өндіруші құжаттамасы мен монтаж талаптарын маманмен тексеріңіз.',
    'Это варианты по характеристикам каталога, а не гарантия электрической совместимости. Проверьте документацию производителя и требования монтажа со специалистом.');
  const alternatives = inspected.filter(({ comparison }) => comparison.matches).map(({ product, comparison }) => {
    const reasons = [textFor(language, 'Бір санаттағы тауар.', 'Товар из той же категории.')];
    if (comparison.matchedAttributes.length) reasons.push(textFor(language, `Салыстырылған сипаттамалар: ${comparison.matchedAttributes.join(', ')}.`, `Сопоставлены характеристики: ${comparison.matchedAttributes.join(', ')}.`));
    reasons.push(textFor(language, `Таңдалған қалада қолжетімді: ${product.availableQuantity} ${product.unit || ''}.`, `Доступно в выбранном городе: ${product.availableQuantity} ${product.unit || ''}.`));
    if (source.cityOffer) {
      const delta = Math.round((product.cityOffer.webPrice - source.cityOffer.webPrice) * 100) / 100;
      reasons.push(textFor(language, `Баға айырмасы: ${delta > 0 ? '+' : ''}${delta} ₸.`, `Разница в цене: ${delta > 0 ? '+' : ''}${delta} ₸.`));
    }
    const warnings = [];
    if (comparison.missing.length || !comparison.matchedAttributes.length) warnings.push(textFor(language, 'Маңызды сипаттамалардың бір бөлігі каталогта жоқ; олар тексерілмеген.', 'Часть важных характеристик отсутствует в каталоге и не проверена.'));
    return { product, reasons, warnings, matchedAttributes: comparison.matchedAttributes, differences: comparison.differences };
  }).sort((a, b) => b.matchedAttributes.length - a.matchedAttributes.length || a.differences.length - b.differences.length || a.product.cityOffer.webPrice - b.product.cityOffer.webPrice).slice(0, boundedLimit(limit, 4));
  return { source, alternatives, city: source.city, warning };
};

const relatedProducts = async ({ productId, citySlug = DEFAULT_CITY, language = 'kk', limit = 6 } = {}) => {
  const source = await getProduct({ productId, citySlug, language });
  return { products: await catalog.findRelatedProducts({ productId: source.id, citySlug, language, limit: boundedLimit(limit) }), city: source.city };
};

module.exports = { searchProducts, getProduct, findAlternatives, relatedProducts, parseSearchQuery, compareSpecifications };

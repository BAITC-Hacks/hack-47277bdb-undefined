'use strict';

const { listFaqs } = require('../../faqs/faq.service');
const { getPage } = require('../../pages/page.service');
const { getCityBySlug } = require('../../cities/city.service');
const { calculateDelivery } = require('../../delivery/delivery.service');
const ApiError = require('../../../utils/apiError');

// These are published CMS page identifiers, not a second hard-coded policy.
const TOPICS = {
  delivery: { slug: 'delivery-and-payment', pattern: /жеткіз|достав|самовывоз|алып кет|pickup|delivery/iu },
  returns: { slug: 'returns-and-exchange', pattern: /қайтар|айырбас|возврат|обмен|гарант|кепіл|return|warranty/iu },
  order: { slug: 'how-to-order', pattern: /тапсырыс|заказ|оформ|order|себет|корзин/iu },
  payment: { slug: 'online-payment', pattern: /төле|төлем|оплат|payment|карт/iu },
  installment: { slug: 'installment', pattern: /бөліп|рассроч|кредит|installment/iu },
  privacy: { slug: 'privacy-policy', pattern: /құпия|конфиденц|деректер|данных|privacy/iu },
  b2b: { slug: 'b2b', pattern: /компани|заңды|юридическ|бсн|бин|b2b|оптов/iu },
};
const normalize = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е');
const tokens = (value) => (normalize(value).match(/[\p{L}\p{N}]+/gu) || []).filter((word) => word.length >= 3);
const citySummary = (city) => ({ id: city.id, slug: city.slug, name: city.name });
const identifyTopics = (query, topic) => {
  if (topic && !TOPICS[topic]) throw new ApiError(422, 'INVALID_PURCHASE_TOPIC', 'Unknown purchase information topic.');
  return topic ? [topic] : Object.keys(TOPICS).filter((key) => TOPICS[key].pattern.test(String(query || '')));
};

const getPurchaseInformation = async ({ query, message, topic, citySlug, language = 'kk', limit = 5 } = {}) => {
  const question = String(query ?? message ?? '').slice(0, 2000);
  const topics = identifyTopics(question, topic);
  const [faqs, pages, city] = await Promise.all([
    listFaqs(language),
    Promise.all([...new Set(topics.map((key) => TOPICS[key].slug))].map(async (slug) => {
      try { return await getPage(slug, language); }
      catch (error) { if (error.code === 'PAGE_NOT_FOUND') return null; throw error; }
    })),
    citySlug ? getCityBySlug(citySlug, language) : null,
  ]);
  const questionTokens = tokens(question);
  const rankedFaqs = faqs.map((faq) => {
    const text = `${faq.question} ${faq.answer}`;
    const haystack = normalize(text);
    const wordScore = questionTokens.filter((word) => haystack.includes(word)).length;
    const topicScore = topics.filter((key) => TOPICS[key].pattern.test(text)).length * 3;
    return { faq, score: wordScore + topicScore };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
  const sources = [
    ...pages.filter(Boolean).map((page) => ({ type: 'page', id: page.id, title: page.title, content: page.content, url: `/${page.slug}`, updatedAt: page.updatedAt })),
    ...rankedFaqs.map(({ faq }) => ({ type: 'faq', id: faq.id, title: faq.question, content: faq.answer, url: '/faq', updatedAt: faq.updatedAt })),
  ].slice(0, Math.max(1, Math.min(8, Number.isInteger(limit) ? limit : 5)));
  const asksMinimum = /миним|ең\s+аз|minimum/iu.test(question);
  const hasMinimumPolicy = sources.some((source) => /(?:минимальн[\p{L}]*\s+(?:сумм|заказ)|ең\s+аз\s+тапсырыс|minimum\s+order)/iu.test(source.content));
  const answer = asksMinimum && !hasMinimumPolicy
    ? language === 'ru'
      ? 'Минимальная сумма заказа не указана в опубликованных данных. Уточните ее у менеджера; порог бесплатной доставки — это не минимальная сумма заказа.'
      : 'Жарияланған деректерде ең аз тапсырыс сомасы көрсетілмеген. Менеджерден нақтылаңыз; тегін жеткізу шегі ең аз тапсырыс сомасы емес.'
    : sources.length
    ? sources.map((source) => `${source.title}\n${source.content}`).join('\n\n')
    : language === 'ru'
      ? 'В опубликованных FAQ и информационных страницах ответ не найден. Уточните вопрос или обратитесь к менеджеру.'
      : 'Жарияланған FAQ және ақпараттық беттерден жауап табылмады. Сұрақты нақтылаңыз немесе менеджерге хабарласыңыз.';
  return { message: answer, sources, city: city ? citySummary(city) : null };
};

const estimateDelivery = async ({ citySlug = 'almaty', subtotal, deliveryMethod = 'DELIVERY', language = 'kk' } = {}) => {
  if (typeof subtotal !== 'number' || !Number.isFinite(subtotal) || subtotal < 0 || subtotal > 1e12) {
    throw new ApiError(422, 'INVALID_SUBTOTAL', 'subtotal must be a non-negative finite number.');
  }
  if (!['DELIVERY', 'PICKUP'].includes(deliveryMethod)) throw new ApiError(422, 'INVALID_DELIVERY_METHOD', 'Choose DELIVERY or PICKUP.');
  const city = await getCityBySlug(citySlug, language);
  const estimate = await calculateDelivery({ cityId: city.id, subtotal, deliveryMethod });
  return {
    city: citySummary(city), subtotal, deliveryMethod,
    deliveryPrice: Number(estimate.deliveryPrice), estimatedHours: estimate.estimatedHours, ruleId: estimate.ruleId,
    warning: language === 'ru'
      ? 'Предварительный расчет по действующему правилу города; итог заказа сервер проверит при оформлении.'
      : 'Қаланың қолданыстағы ережесі бойынша алдын ала есеп; тапсырысты рәсімдегенде сервер қорытындыны тексереді.',
  };
};

module.exports = { getPurchaseInformation, estimateDelivery, identifyTopics };

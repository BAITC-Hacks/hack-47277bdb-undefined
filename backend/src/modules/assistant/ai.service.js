const env = require('../../config/env');
const systemPrompt = require('./prompts/system.prompt');

const READ_INTENTS = ['PRODUCT_SEARCH', 'PRODUCT_DETAILS', 'STOCK_CHECK', 'PRICE_CHECK',
  'CERTIFICATE_SEARCH', 'ANALOG_SEARCH', 'RELATED_PRODUCTS', 'PURCHASE_TERMS',
  'DELIVERY_INFO', 'PAYMENT_INFO', 'RETURN_INFO', 'GENERAL_SUPPORT'];
// Deliberately anchored: quoted, negated, conditional and compound messages are
// not confirmation. The model is never consulted to broaden this allowlist.
const isConfirmation = (message) => /^(?:иә[,!]?\s+қос(?:ыңыз)?|да[,!]?\s+добавь(?:те)?|yes[,!]?\s+add)[.!]?$/iu.test(message.trim());
const isCancellation = (message) => /^(?:жоқ(?:[,!]?\s+қоспа)?|бас тартамын|болдырмау|нет(?:[,!]?\s+не добавляй)?|отмена|cancel|no)[.!]?$/iu.test(message.trim());
const isCartRequest = (message) => /(?:себет[\p{L}]*.*қос|қос.*себет|добав[\p{L}]*.*корзин|корзин[\p{L}]*.*добав|add.*cart)/iu.test(message)
  && !/(?:қоспа|қосуға болмай|не\s+добав|don't|do not|егер|если|if\s|[«»"“”])/iu.test(message);
const parseQuantity = (message) => {
  // Ratings such as 16А / C16 are not quantities.
  const match = message.match(/(?:^|\s)(\d{1,5})\s*(?:дана(?:сын|сы|сынa)?|шт(?:ук[аиу]?)?\.?|pieces?|pcs?|метр|м)(?=\s|$|[,!?])/iu)
    || message.match(/(?:қос(?:ыңыз)?|добавь(?:те)?|add)\s+(\d{1,5})(?=\s|$|[,!?])/iu);
  return match ? Number(match[1]) : undefined;
};
const rules = [
  ['CART_VIEW', /(?:себет|корзин|cart)/iu],
  ['CERTIFICATE_SEARCH', /(?:сертификат|certificate|паспорт|нұсқаулық|manual)/iu],
  ['ANALOG_SEARCH', /(?:аналог|балама|алмастыр|замен|alternative|replacement)/iu],
  ['DELIVERY_INFO', /(?:жеткіз|достав|delivery)/iu],
  ['PAYMENT_INFO', /(?:төле|төлем|оплат|payment)/iu],
  ['RETURN_INFO', /(?:қайтар|возврат|return)/iu],
  ['PURCHASE_TERMS', /(?:миним|ең\s+аз|сатып\s+алу|қалай.*тапсырыс|шарт|оптом|счет|purchase)/iu],
  ['STOCK_CHECK', /(?:қойма|қалдық|бар\s+ма|налич|остат|stock|қолжетімді)/iu],
  ['PRICE_CHECK', /(?:баға|бағас|қанша\s+тұрады|цен[ау]|стоимост|price)/iu],
  ['RELATED_PRODUCTS', /(?:қатысты|бірге|сопутств|аксессуар|related)/iu],
  ['PRODUCT_DETAILS', /(?:сипаттама|сипатт|параметр|техник|характерист|details)/iu],
  ['FILE_INPUT', /(?:файл|excel|word|pdf|xlsx|docx|jpeg|фото|сурет)/iu],
  ['GENERAL_SUPPORT', /^(?:сәлем[\p{L}]*|салем|здравствуй[\p{L}]*|привет|hello|hi)[.!\s]*$/iu],
];
function ruleClassify(message) {
  const intent = isConfirmation(message) ? 'CART_CONFIRMATION'
    : isCancellation(message) ? 'CART_CANCEL'
      : isCartRequest(message) ? 'ADD_TO_CART_INTENT'
        : rules.find(([, expression]) => expression.test(message))?.[0] || 'PRODUCT_SEARCH';
  return { intent, query: message, quantity: parseQuantity(message), mode: 'rules' };
}

async function classify({ message, language = 'kk', history = [] }, { fetchImpl = globalThis.fetch } = {}) {
  const fallback = ruleClassify(message);
  // Deterministic actionable and known intents take precedence over any model.
  if (fallback.intent !== 'PRODUCT_SEARCH' || !env.assistantLlmEnabled || !env.openaiApiKey) return fallback;
  try {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${env.openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.openaiModel, store: false, max_output_tokens: 300,
        input: [{ role: 'system', content: systemPrompt }, { role: 'user', content: JSON.stringify({ language,
          history: history.slice(-6).map(({ role, content }) => ({ role, content: String(content).slice(0, 500) })), message }) }],
        text: { format: { type: 'json_schema', name: 'assistant_read_intent', strict: true,
          schema: { type: 'object', properties: { intent: { type: 'string', enum: READ_INTENTS }, query: { type: 'string' } },
            required: ['intent', 'query'], additionalProperties: false } } },
      }),
    });
    if (!response.ok) return { ...fallback, mode: 'rules_fallback' };
    const body = await response.json();
    const text = body.output?.filter((item) => item.type === 'message').flatMap((item) => item.content || [])
      .find((item) => item.type === 'output_text')?.text;
    const parsed = JSON.parse(text);
    if (!READ_INTENTS.includes(parsed.intent) || typeof parsed.query !== 'string' || parsed.query.length > 200) return { ...fallback, mode: 'rules_fallback' };
    return { intent: parsed.intent, query: parsed.query, mode: 'openai' };
  } catch {
    // Never log provider objects/headers, keys or customer messages.
    return { ...fallback, mode: 'rules_fallback' };
  }
}

module.exports = { classify, ruleClassify, isConfirmation, isCancellation, isCartRequest, parseQuantity };

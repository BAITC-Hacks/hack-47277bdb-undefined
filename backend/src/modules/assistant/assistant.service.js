const prisma = require('../../config/prisma');
const env = require('../../config/env');
const ApiError = require('../../utils/apiError');
const serializable = require('../../utils/transaction');
const ai = require('./ai.service');
const products = require('./tools/product.tools');
const purchase = require('./tools/purchase.tools');
const cartTools = require('./tools/cart.tools');
const cartService = require('../cart/cart.service');
const { resolveCatalogCity } = require('../products/product-query.service');
const { getProductAvailability } = require('../products/product.service');
const { assertSafeMessage } = require('./assistant.safety');

const say = (language, kk, ru) => language === 'ru' ? ru : kk;
const ownerKey = (identity) => identity.userId ? `user:${identity.userId}` : `guest:${identity.sessionId}`;
const expiry = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const info = (message, extra = {}) => ({ type: 'message', message, ...extra });
const safeHistory = (history) => Array.isArray(history) ? history.slice(-18) : [];
const pendingDto = (action) => ({ id: action.id, type: 'ADD_TO_CART', productId: action.productId,
  productName: action.productName, quantity: action.quantity, city: action.citySlug,
  unitPrice: Number(action.unitPrice), expiresAt: action.expiresAt.toISOString(), requiresConfirmation: true });

// Only known referential/action words can reuse a previous selection. An
// unfamiliar model/category/noun must trigger fresh search or clarification.
const productQuery = (message) => String(message).toLowerCase().match(/[\p{L}\p{N}._-]+/gu)?.filter((word) =>
  !/^\d+$/.test(word) && !/^(?:осы|оны|оның|бұл|бұның|соның|маған|керек|қандай|қанша|бар|ма|менің|этот|его|это|мне|нужно|нужен|пожалуйста|какие|какая|какой|есть|ли|штук[аиу]?|дана[\p{L}]*|шт|метр[\p{L}]*|себет[\p{L}]*|корзин[\p{L}]*|қос[\p{L}]*|добав[\p{L}]*|в|техник[\p{L}]*|сипатт[\p{L}]*|характерист[\p{L}]*|параметр[\p{L}]*|сертификат[\p{L}]*|нұсқаулық[\p{L}]*|баға[\p{L}]*|цен[ау]|стоимость|қойма[\p{L}]*|қалдық[\p{L}]*|налич[\p{L}]*|остат[\p{L}]*|қолжетімді[\p{L}]*|аналог[\p{L}]*|балама[\p{L}]*|тауар[\p{L}]*|товар[\p{L}]*|көрсет[\p{L}]*|покажи[\p{L}]*|тексер[\p{L}]*|узнать|check|its|this|the|add|cart|to|of|please|details|price|stock|certificate|specifications|available|is|it|related|products|баламасы|сопутствующие)$/iu.test(word)
).join(' ') || '';

// Explicit product selection wins; otherwise references shown in the current
// conversation are used. Never silently choose the first of several products.
async function resolveProduct(input, conversation, classification, city, language) {
  const query = classification.query || input.message;
  // A new SKU in a follow-up must not accidentally select an older product.
  const reference = query.match(/(?:sku|артикул)\s*[:#]?\s*([\p{L}\d][\p{L}\d._-]{2,100})/iu)?.[1]
    || query.match(/(?<![\p{L}\d])([A-Za-z\d]+(?:[-_][A-Za-z\d]+)+)(?![\p{L}\d])/u)?.[1];
  let referencedProduct;
  if (reference) {
    try { referencedProduct = await products.getProduct({ sku: reference, citySlug: city, language }); }
    catch (error) { if (error.code !== 'PRODUCT_NOT_FOUND') throw error; }
  }
  if (input.selectedProductId) {
    if (referencedProduct && referencedProduct.id !== input.selectedProductId) throw new ApiError(422, 'CONFLICTING_PRODUCT_REFERENCE', 'Таңдалған тауар мен мәтіндегі артикул сәйкес емес');
    return products.getProduct({ productId: input.selectedProductId, citySlug: city, language });
  }
  if (referencedProduct) return referencedProduct;
  const freshQuery = productQuery(query);
  if (conversation.selectedProductId && !reference && !freshQuery) return products.getProduct({ productId: conversation.selectedProductId, citySlug: city, language });
  if (!freshQuery) return null;
  const found = await products.searchProducts({ query: freshQuery, citySlug: city, language, limit: 6 });
  return found.products.length === 1 ? products.getProduct({ productId: found.products[0].id, citySlug: city, language }) : null;
}

const productMessage = (product, language) => {
  const price = product.cityOffer ? `${product.cityOffer.webPrice} ₸` : say(language, 'баға көрсетілмеген', 'цена не указана');
  return `${product.name} (${product.sku}) — ${price}. ${say(language, 'Қолжетімді саны', 'Доступное количество')}: ${product.availableQuantity}.`;
};

async function chat({ identity, sessionId, language, ...input }) {
  assertSafeMessage(input.message);
  const key = { ownerKey: ownerKey(identity), sessionId };
  // A body-provided ID is only a conversation key, never an authenticated owner.
  const initial = await prisma.assistantConversation.upsert({
    where: { ownerKey_sessionId: key }, update: {},
    create: { ...key, userId: identity.userId || null, expiresAt: expiry() },
  });
  const chosenLanguage = language || initial.language || 'kk';
  // No network/provider calls occur inside the retryable commerce transaction.
  const classification = await ai.classify({ message: input.message, language: chosenLanguage,
    history: initial.expiresAt > new Date() ? safeHistory(initial.history) : [] });
  const result = await serializable(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "AssistantConversation" WHERE "id" = ${initial.id}::uuid FOR UPDATE`;
    let conversation = await tx.assistantConversation.findUniqueOrThrow({ where: { id: initial.id } });
    if (conversation.expiresAt <= new Date()) {
      await tx.assistantPendingAction.updateMany({ where: { conversationId: conversation.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      conversation = { ...conversation, history: [], selectedProductId: null, recentProductIds: [], citySlug: null };
    }
    try {
      const lang = chosenLanguage;
      let city = input.city || conversation.citySlug;
      if (city) {
        const active = await resolveCatalogCity(city, false, tx);
        if (!active) throw new ApiError(404, 'CITY_NOT_FOUND', 'Қала табылмады');
        city = active.slug;
      }
      const pending = await tx.assistantPendingAction.findFirst({ where: { conversationId: conversation.id, status: 'PENDING' } });
      const cancelPending = (status = 'CANCELLED') => tx.assistantPendingAction.updateMany({
        where: { conversationId: conversation.id, status: 'PENDING' }, data: { status },
      });
      let response;
      let selection = conversation.selectedProductId;
      let recent = Array.isArray(conversation.recentProductIds) ? conversation.recentProductIds : [];
      const intent = classification.intent;
      if (ai.isConfirmation(input.message)) {
        if (!pending) response = info(say(lang, 'Растайтын ұсыныс жоқ. Алдымен тауар мен санын таңдаңыз.', 'Нет предложения для подтверждения. Сначала выберите товар и количество.'));
        else if (input.pendingActionId && input.pendingActionId !== pending.id) {
          throw new ApiError(409, 'PENDING_ACTION_MISMATCH', 'Бұл растау ағымдағы ұсынысқа тиесілі емес');
        } else if (pending.expiresAt <= new Date()) {
          await cancelPending('EXPIRED');
          response = info(say(lang, 'Ұсыныстың мерзімі өтті. Қосуды қайта сұраңыз.', 'Предложение истекло. Запросите добавление заново.'));
        } else if (city !== pending.citySlug || (input.selectedProductId && input.selectedProductId !== pending.productId)
          || (input.quantity !== undefined && input.quantity !== pending.quantity)) {
          await cancelPending();
          response = info(say(lang, 'Қала, тауар немесе саны өзгерді. Жаңа ұсыныс қажет.', 'Город, товар или количество изменились. Нужно новое предложение.'));
        } else {
          const cart = await cartTools.confirm({ identity, pending, language: lang }, tx);
          await tx.assistantPendingAction.update({ where: { id: pending.id }, data: { status: 'CONFIRMED', completedAt: new Date() } });
          response = { type: 'cart', message: say(lang, 'Расталған тауар себетке қосылды.', 'Подтвержденный товар добавлен в корзину.'),
            cart, cartUrl: '/cart', checkoutUrl: '/checkout', confirmedActionId: pending.id };
        }
      } else if (ai.isCancellation(input.message)) {
        await cancelPending();
        response = info(say(lang, 'Қосу тоқтатылды. Себет өзгерген жоқ.', 'Добавление отменено. Корзина не изменена.'));
      } else {
        // A different turn invalidates the old proposal, so an unrelated later
        // "yes" cannot authorize an earlier action. New add requests replace it.
        await cancelPending();
        if (['PAYMENT_INFO', 'DELIVERY_INFO', 'PURCHASE_TERMS', 'RETURN_INFO'].includes(intent)) {
          const topic = { PAYMENT_INFO: 'payment', DELIVERY_INFO: 'delivery', RETURN_INFO: 'returns' }[intent];
          response = { type: 'knowledge', ...(await purchase.getPurchaseInformation({ query: input.message, topic, citySlug: city, language: lang })) };
          if (intent === 'DELIVERY_INFO' && city) {
            const cart = await cartService.getCart(identity, lang, tx);
            if (cart.items.length && cart.city?.slug === city) {
              response.deliveryEstimate = await purchase.estimateDelivery({ citySlug: city, subtotal: cart.subtotal, language: lang });
              response.message += '\n' + say(lang, `Ағымдағы себетке алдын ала жеткізу: ${response.deliveryEstimate.deliveryPrice} ₸. Соңғы соманы checkout тексереді.`,
                `Предварительная доставка для текущей корзины: ${response.deliveryEstimate.deliveryPrice} ₸. Итог проверяется при оформлении.`);
            }
          }
        } else if (intent === 'FILE_INPUT') {
          response = info(say(lang, 'Файл өңдеу модулі дайындалған, бірақ чатта файл жүктеу әлі қосылмаған. Артикулды немесе талаптарды мәтінмен жазыңыз.',
            'Модуль обработки файлов подготовлен, но загрузка в чат пока не подключена. Напишите артикул или требования текстом.'), { code: 'ASSISTANT_FILE_INPUT_NOT_ENABLED' });
        } else if (intent === 'GENERAL_SUPPORT') {
          response = info(say(lang, 'Тауар, техникалық сипаттама, сертификат, қаладағы баға мен қалдық туралы көмектесемін. Себетке қоспас бұрын растауды сұраймын.',
            'Помогу с товаром, характеристиками, сертификатом, ценой и остатками в городе. Перед добавлением в корзину попрошу подтверждение.'));
        } else if (intent === 'CART_VIEW') {
          response = { type: 'cart', message: say(lang, 'Ағымдағы себет.', 'Текущая корзина.'), cart: await cartService.getCart(identity, lang, tx), cartUrl: '/cart', checkoutUrl: '/checkout' };
        } else if (!city) {
          response = info(say(lang, 'Баға мен қалдықты тексеру үшін қаланы таңдаңыз.', 'Выберите город для проверки цены и наличия.'), { code: 'CITY_REQUIRED' });
        } else if (intent === 'PRODUCT_SEARCH' && !input.selectedProductId) {
          const result = await products.searchProducts({ query: classification.query || input.message, citySlug: city, language: lang, limit: 6 });
          recent = result.products.map((product) => product.id);
          selection = recent.length === 1 ? recent[0] : null;
          response = { type: 'products', ...result, message: result.products.length
            ? result.products.map((product) => productMessage(product, lang)).join('\n')
            : say(lang, 'Тауар табылмады. Артикулды немесе нақты талаптарды жазыңыз.', 'Товар не найден. Укажите артикул или точные требования.') };
          const unavailable = result.products.find((product) => product.availableQuantity < 1 || !product.cityOffer);
          if (unavailable) {
            const alternative = await products.findAlternatives({ productId: unavailable.id, citySlug: city, language: lang });
            response.alternatives = alternative.alternatives;
            response.alternativeWarning = alternative.warning;
          }
        } else {
          const product = await resolveProduct(input, conversation, classification, city, lang);
          if (!product) {
            if (productQuery(classification.query || input.message)) { selection = null; recent = []; }
            response = info(say(lang, 'Нақты тауарды таңдаңыз (selectedProductId) немесе артикулын жазыңыз. Бірнеше нұсқадан өзім таңдамаймын.',
              'Выберите конкретный товар (selectedProductId) или укажите артикул. Я не выберу за вас из нескольких вариантов.'), { code: 'PRODUCT_SELECTION_REQUIRED', productIds: recent });
          }
          else {
            selection = product.id;
            if (intent === 'ADD_TO_CART_INTENT') {
              const quantity = input.quantity ?? classification.quantity;
              if (!quantity) response = info(say(lang, 'Қанша қосу керек? Мысалы: «3 данасын себетке қос».', 'Сколько добавить? Например: «Добавь 3 шт в корзину».'));
              else if (quantity > product.availableQuantity || !product.cityOffer) {
                response = { type: 'product', code: 'INSUFFICIENT_STOCK', product,
                  message: say(lang, `Сұралған санға қалдық жеткіліксіз. ${productMessage(product, lang)}`, `Недостаточно остатка для запрошенного количества. ${productMessage(product, lang)}`) };
              } else {
                const proposal = await cartTools.prepare({ identity, productId: product.id, quantity, city, language: lang }, tx);
                const action = await tx.assistantPendingAction.create({ data: { conversationId: conversation.id, ...proposal,
                  expiresAt: new Date(Date.now() + env.assistantProposalTtl * 1000) } });
                const quantityLabel = product.unit === 'дана' ? `${quantity} данасын` : `${quantity} ${product.unit || ''} көлемін`;
                response = { type: 'pending_action', pendingAction: pendingDto(action),
                  message: say(lang, `${product.name} — ${quantityLabel} себетке қосайын ба? Қала: ${city}. Бірлік бағасы: ${proposal.unitPrice} ₸. «Иә, қос» деп растаңыз.`,
                    `Добавить ${quantity} единиц ${product.name} в корзину? Город: ${city}. Цена за единицу: ${proposal.unitPrice} ₸. Подтвердите: «Да, добавь».`),
                  quickReplies: [say(lang, 'Иә, қос', 'Да, добавь'), say(lang, 'Жоқ, қоспа', 'Нет, не добавляй')] };
              }
            } else if (intent === 'ANALOG_SEARCH') {
              const result = await products.findAlternatives({ productId: product.id, citySlug: city, language: lang, quantity: input.quantity || 1 });
              response = { type: 'alternatives', ...result, message: result.alternatives.length
                ? result.alternatives.map(({ product: option, reasons }) => `${productMessage(option, lang)} ${reasons.join('; ')}`).join('\n')
                : say(lang, 'Қоймада расталған балама табылмады. Басқа қаланы не талаптарды нақтылаңыз.', 'Подтвержденная доступная альтернатива не найдена. Уточните город или требования.') };
            } else if (intent === 'RELATED_PRODUCTS') {
              response = { type: 'products', ...(await products.relatedProducts({ productId: product.id, citySlug: city, language: lang })), message: say(lang, 'Осы санаттағы байланысты тауарлар.', 'Связанные товары из этой категории.') };
            } else {
              response = { type: intent === 'CERTIFICATE_SEARCH' ? 'certificates' : intent === 'STOCK_CHECK' ? 'stock' : 'product', product,
                message: productMessage(product, lang) };
              if (intent === 'CERTIFICATE_SEARCH') {
                response.certificates = product.certificateUrl ? [{ url: product.certificateUrl, productId: product.id }] : [];
                response.manualUrl = product.manualUrl;
                response.message = product.certificateUrl
                  ? say(lang, 'Каталогтағы сертификат сілтемесі қоса берілді.', 'Ссылка на сертификат из каталога приложена.')
                  : say(lang, 'Бұл тауардың сертификаты каталогта жоқ. Файлды ойдан жасамаймын.', 'Сертификат отсутствует в каталоге. Файл не придуман.');
              }
              if (intent === 'PRODUCT_DETAILS') response.message += '\n' + product.technicalSpecifications.map((spec) => `${spec.name}: ${spec.value ?? '—'} ${spec.unit || ''}`).join('\n');
              if (intent === 'STOCK_CHECK') response.availability = await getProductAvailability({ productId: product.id, citySlug: city, language: lang });
            }
            if (product.availableQuantity < 1 || !product.cityOffer || response.code === 'INSUFFICIENT_STOCK') {
              const alternative = await products.findAlternatives({ productId: product.id, citySlug: city, language: lang, quantity: input.quantity || classification.quantity || 1 });
              response.alternatives = alternative.alternatives;
              response.alternativeWarning = alternative.warning;
              response.message += alternative.alternatives.length
                ? '\n' + alternative.alternatives.map(({ product: option, reasons }) => `${productMessage(option, lang)} ${reasons.join('; ')}`).join('\n')
                : '\n' + say(lang, 'Бұл қалада расталған қолжетімді балама табылмады.', 'Подтвержденная доступная альтернатива в этом городе не найдена.');
            }
          }
        }
      }
      const history = [...safeHistory(conversation.history), { role: 'user', content: input.message },
        { role: 'assistant', content: response.message.slice(0, 4000) }].slice(-20);
      await tx.assistantConversation.update({ where: { id: conversation.id }, data: {
        citySlug: city || null, language: lang, selectedProductId: selection, recentProductIds: recent,
        history, revision: { increment: 1 }, expiresAt: expiry(),
      } });
      return { ...response, sessionId, language: lang, city: city || null, intent, mode: classification.mode };
    } catch (error) {
      // A failed NEW read/proposal must not resurrect an older pending action
      // via transaction rollback. No commerce writes occur in these branches.
      // Confirmation failures still roll the ENTIRE commerce transaction back.
      if (!(error instanceof ApiError) || ai.isConfirmation(input.message)) throw error;
      await tx.assistantPendingAction.updateMany({ where: { conversationId: conversation.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      await tx.assistantConversation.update({ where: { id: conversation.id }, data: { selectedProductId: null, recentProductIds: [], revision: { increment: 1 } } });
      return { failure: error };
    }
  });
  if (result.failure) throw result.failure;
  return result;
}

module.exports = { chat };

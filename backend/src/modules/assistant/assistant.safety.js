const ApiError = require('../../utils/apiError');

// Refuse before history persistence or provider calls. No card data is echoed.
const containsPaymentDetails = (text) => /(?:\d[ -]?){13,19}/u.test(text)
  || /(?:cvv|cvc|pin|пин|код\s+карты|картаның\s+коды)\s*[:=\-]?\s*\d{3,6}/iu.test(text)
  || /(?:expiry|expires|жарамдылық(?:\s+мерзімі)?|срок\s+действия|код\s+безопасности|қауіпсіздік\s+коды)\s*[:=\-]?\s*\d/iu.test(text)
  || /(?:^|\s)(?:0[1-9]|1[0-2])\s*\/\s*(?:20)?\d{2}(?=$|\s|[,.])/u.test(text);
function assertSafeMessage(message) {
  if (containsPaymentDetails(message)) throw new ApiError(422, 'PAYMENT_DATA_NOT_ALLOWED',
    'Карта нөмірін, CVV/CVC, PIN немесе жарамдылық мерзімін жібермеңіз. Төлемді тек ресми төлем бетінде орындаңыз.');
  if (/(?:под\s+напряжени|без\s+отключения|обойти\s+(?:защит|автомат|узо)|live\s+(?:wire|electrical)|кернеуді\s+өшірмей)/iu.test(message)) {
    throw new ApiError(422, 'UNSAFE_ELECTRICAL_REQUEST', 'Электр жұмыстарын кернеу ажыратылғанда білікті маман орындауы керек.');
  }
}
module.exports = { assertSafeMessage, containsPaymentDetails };

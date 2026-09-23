import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, Send, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { assistantApi } from '../../api/assistant.api';
import { extractApiError } from '../../api/client';
import { useAuth, useCart, useCity, useLanguage } from '../../contexts/AppContexts';
import type { AssistantChatInput, AssistantChatResult, AssistantPendingAction } from '../../types/assistant.types';
import type { Product } from '../../types/product.types';
import { formatPrice } from '../../utils/format';
import { getGuestSessionId } from '../../utils/session';
import { readStorage, storageKeys } from '../../utils/storage';
import '../../styles/assistant.css';

type Turn = { id: number; question: string; answer: AssistantChatResult };
type Selection = Pick<AssistantChatInput, 'selectedProductId' | 'quantity' | 'pendingActionId'>;
// Mirror the backend's explicit confirmation allowlist, never infer consent.
const isConfirmation = (message: string) => /^(?:иә[,!]?\s+қос(?:ыңыз)?|да[,!]?\s+добавь(?:те)?|yes[,!]?\s+add)[.!]?$/iu.test(message.trim());

export function AssistantWidget() {
  const { user, loading } = useAuth();
  const { city } = useCity();
  // No account's transcript/pending buttons survive logout or a city change.
  // The server still keeps conversation context using the existing guest UUID.
  const owner = loading ? 'loading' : user ? `user:${user.id}` : `guest:${getGuestSessionId()}`;
  return <AssistantSession key={`${owner}:${city}`} />;
}

function AssistantSession() {
  const { loading: authLoading } = useAuth();
  const { city, cities, loading: cityLoading } = useCity();
  const { language } = useLanguage();
  const { refresh, loading: cartLoading } = useCart();
  const ru = language === 'ru';
  const say = (kk: string, russian: string) => ru ? russian : kk;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [pending, setPending] = useState<AssistantPendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const counter = useRef(0);
  const disabled = busy || authLoading || cityLoading || cartLoading;
  const cityName = cities.find((item) => item.slug === city)?.name || city;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);
  useEffect(() => {
    if (open) textarea.current?.focus();
  }, [open]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [turns, busy, open]);

  const close = () => { setOpen(false); launcher.current?.focus(); };
  const send = async (rawMessage: string, selection: Selection = {}) => {
    const message = rawMessage.trim();
    if (!message || message.length > 4000 || disabled || inFlight.current) return;
    const confirming = isConfirmation(message);
    const proposal = pending;
    if (confirming && (!proposal || proposal.city !== city || Date.parse(proposal.expiresAt) <= Date.now())) {
      setPending(null);
      setError(say('Растайтын жаңа ұсыныс жоқ. Алдымен тауар мен санын қайта таңдаңыз.', 'Нет актуального предложения. Сначала снова выберите товар и количество.'));
      return;
    }
    const token = readStorage(storageKeys.token);
    const session = getGuestSessionId();
    const stillCurrent = () => mounted.current && readStorage(storageKeys.token) === token && getGuestSessionId() === session;
    inFlight.current = true;
    controller.current = new AbortController();
    setBusy(true); setError(''); setDraft(''); setPending(null);
    try {
      const answer = await assistantApi.chat({ message, city, ...selection,
        ...(confirming && proposal ? { pendingActionId: proposal.id } : {}),
      }, controller.current.signal);
      if (!stillCurrent()) return;
      // No HTML rendering or localStorage transcript; rejected sensitive input
      // never becomes a displayed conversation turn.
      const turn = { id: ++counter.current, question: message, answer };
      setTurns((previous) => [...previous, turn].slice(-20));
      setPending(answer.pendingAction || null); setNow(Date.now());
      if (answer.product) setSelected(answer.product);
      else if (answer.products) setSelected(answer.products.length === 1 ? answer.products[0] : null);
      if (answer.code === 'PRODUCT_SELECTION_REQUIRED') setSelected(null);
      // The assistant already performed any confirmed write. Do not add twice.
      if (answer.type === 'cart') {
        try { await refresh(); }
        catch { if (stillCurrent()) setError(say('Жауап алынды, бірақ себет белгішесі жаңартылмады. Себет бетін ашып тексеріңіз.', 'Ответ получен, но счетчик корзины не обновился. Проверьте страницу корзины.')); }
      }
    } catch (reason) {
      if (stillCurrent()) {
        setError(`${extractApiError(reason)}${confirming ? say(' Қосу сұрауын автоматты қайталамаймыз. Алдымен себетті тексеріңіз.', ' Добавление не повторяется автоматически. Сначала проверьте корзину.') : ''}`);
        if (!confirming) setDraft(message);
      }
    } finally {
      if (stillCurrent()) { inFlight.current = false; setBusy(false); }
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void send(draft); };
  const choose = (product: Product) => void send(say('Сипаттамаларын көрсет', 'Покажи характеристики'), { selectedProductId: product.id });
  const expired = Boolean(pending && Date.parse(pending.expiresAt) <= now);

  return <>
    {open && <section id="assistant-chat" className="assistant-chat" aria-labelledby="assistant-chat-title" onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
      <header className="assistant-chat-header"><h2 id="assistant-chat-title"><Bot size={20} />{say('ИИ консультант', 'ИИ консультант')}</h2><button type="button" aria-label={say('Чатты жабу', 'Закрыть чат')} onClick={close}><X size={20} /></button></header>
      <p className="assistant-chat-context">{cityName} · {say('Баға мен қалдық каталогтан алынады', 'Цены и остатки из каталога')}</p>
      <div className="assistant-chat-log" role="log" aria-label={say('Чат хабарламалары', 'Сообщения чата')} aria-live="polite" aria-relevant="additions" ref={log}>
        <p className="assistant-chat-message is-assistant">{say('Сәлем! Тауар, сипаттама, сертификат немесе жеткізу туралы сұраңыз. Себетке қоспас бұрын растауды сұраймын. Карта нөмірін және CVV жібермеңіз.', 'Здравствуйте! Спросите о товаре, характеристиках, сертификате или доставке. Перед добавлением в корзину попрошу подтверждение. Не отправляйте номер карты и CVV.')}</p>
        {turns.map((turn) => <div key={turn.id}>
          <p className="assistant-chat-message is-user assistant-chat-text">{turn.question}</p>
          <div className="assistant-chat-message is-assistant"><AssistantAnswer answer={turn.answer} choose={choose} disabled={disabled} language={language} /></div>
        </div>)}
        {busy && <p role="status">{say('Жауап дайындалуда…', 'Готовим ответ…')}</p>}
      </div>
      {pending && <section className="assistant-chat-pending" aria-label={say('Себетке қосуды растау', 'Подтверждение добавления')}>
        <strong>{pending.productName}</strong><p>{pending.quantity} × {formatPrice(pending.unitPrice)} · {cityName}</p>
        <p>{expired ? say('Ұсыныс мерзімі өтті. Қосуды қайта сұраңыз.', 'Предложение истекло. Запросите добавление заново.') : say('Себетке қосайын ба?', 'Добавить в корзину?')}</p>
        <div className="assistant-chat-actions"><button type="button" disabled={disabled || expired} onClick={() => void send(say('Иә, қос', 'Да, добавь'))}>{say('Иә, қос', 'Да, добавь')}</button><button type="button" disabled={disabled} onClick={() => void send(say('Жоқ, қоспа', 'Нет, не добавляй'), { pendingActionId: pending.id })}>{say('Жоқ, қоспа', 'Нет, не добавляй')}</button></div>
      </section>}
      {selected && !pending && <div className="assistant-chat-context"><span>{say('Таңдалды', 'Выбрано')}: {selected.name}</span><div className="assistant-chat-actions">
        {[[say('Сипаттамалар', 'Характеристики'), say('Сипаттамаларын көрсет', 'Покажи характеристики')], [say('Сертификат', 'Сертификат'), say('Сертификатын көрсет', 'Покажи сертификат')], [say('Қалдық', 'Остаток'), say('Қоймадағы қалдық', 'Остаток на складе')]].map(([label, message]) => <button key={label} type="button" disabled={disabled} onClick={() => void send(message, { selectedProductId: selected.id })}>{label}</button>)}
        <button type="button" disabled={disabled} onClick={() => void send(say('1 данасын себетке қос', 'Добавь 1 шт в корзину'), { selectedProductId: selected.id, quantity: 1 })}>{say('1 данасын қосу', 'Добавить 1 шт')}</button>
      </div></div>}
      {error && <div className="assistant-chat-error" role="alert">{error} <Link to="/cart" onClick={close}>{say('Себетті тексеру', 'Проверить корзину')}</Link></div>}
      <div className="assistant-chat-actions">
        <button type="button" disabled={disabled} onClick={() => void send(say('Маған 16А автомат керек', 'Мне нужен автомат 16А'))}>16А автомат</button>
        <button type="button" disabled={disabled} onClick={() => void send(say('Жеткізу шарттары қандай?', 'Какие условия доставки?'))}>{say('Жеткізу', 'Доставка')}</button>
        <button type="button" disabled={disabled} onClick={() => void send(say('Себетті көрсет', 'Покажи корзину'))}>{say('Себет', 'Корзина')}</button>
      </div>
      <form className="assistant-chat-form" onSubmit={submit}>
        <textarea ref={textarea} name="message" aria-label={say('Ассистентке хабарлама', 'Сообщение ассистенту')} placeholder={say('Мысалы: 3 данасын себетке қос', 'Например: добавь 3 шт в корзину')} value={draft} maxLength={4000} rows={2} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); } }} />
        <button type="submit" aria-label={say('Жіберу', 'Отправить')} disabled={disabled || !draft.trim()}><Send size={19} /></button>
      </form>
    </section>}
    <button ref={launcher} type="button" className="assistant-chat-launcher" aria-controls="assistant-chat" aria-expanded={open} onClick={() => setOpen(!open)}><Bot size={20} />ИИ консультант</button>
  </>;
}

function AssistantAnswer({ answer, choose, disabled, language }: { answer: AssistantChatResult; choose: (product: Product) => void; disabled: boolean; language: 'kk' | 'ru' }) {
  const ru = language === 'ru';
  const products = answer.products || (answer.product ? [answer.product] : []);
  const productCard = (product: Product) => <article className="assistant-chat-product" key={product.id}>
    <h3><Link to={`/product/${encodeURIComponent(product.slug)}`}>{product.name}</Link></h3>
    <p>{product.sku} · {formatPrice(product.price)}</p><p>{ru ? 'Доступно' : 'Қолжетімді'}: {product.availableQuantity} {product.unit || ''}</p>
    <button type="button" disabled={disabled} onClick={() => choose(product)}>{ru ? 'Выбрать' : 'Таңдау'}</button>
  </article>;
  return <>
    <p className="assistant-chat-text">{answer.message}</p>
    {products.length > 0 && <div className="assistant-chat-products">{products.map(productCard)}</div>}
    {!!answer.product?.technicalSpecifications.length && <dl className="assistant-chat-specs">{answer.product.technicalSpecifications.map((spec) => <div key={spec.key}><dt>{spec.name}</dt><dd>{String(spec.value ?? '—')} {spec.unit}</dd></div>)}</dl>}
    {answer.availability?.warehouses.map((warehouse) => <p key={warehouse.id}>{warehouse.name}: {warehouse.availableQuantity}</p>)}
    {answer.alternatives?.map((item) => <div key={item.product.id}>{productCard(item.product)}<p>{item.reasons.join(' ')}</p><p>{item.warnings.join(' ')}</p><p>{item.differences.join('; ')}</p></div>)}
    {(answer.warning || answer.alternativeWarning) && <p>{answer.warning || answer.alternativeWarning}</p>}
    <div className="assistant-chat-links">
      {answer.certificates?.map((certificate, index) => <a key={`${certificate.productId}:${index}`} href={certificate.url} target="_blank" rel="noopener noreferrer">{ru ? 'Сертификат' : 'Сертификат'} {index + 1}</a>)}
      {answer.manualUrl && <a href={answer.manualUrl} target="_blank" rel="noopener noreferrer">{ru ? 'Инструкция' : 'Нұсқаулық'}</a>}
      {answer.sources?.filter((source) => /^\/[a-z0-9-]+$/.test(source.url || '')).map((source, index) => <Link key={index} to={source.url!}>{source.title}</Link>)}
      {answer.type === 'cart' && <><Link to="/cart">{ru ? 'Открыть корзину' : 'Себетке өту'}</Link><Link to="/checkout">{ru ? 'Оформить заказ' : 'Тапсырысты рәсімдеу'}</Link></>}
    </div>
    {answer.cart && <p>{ru ? 'В корзине' : 'Себетте'}: {answer.cart.totalItemCount} · {formatPrice(answer.cart.subtotal)}</p>}
  </>;
}

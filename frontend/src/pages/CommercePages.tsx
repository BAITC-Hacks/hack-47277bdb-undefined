import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { CheckCircle2, Trash2 } from "lucide-react";
import { ordersApi } from "../api/orders.api";
import { extractApiError } from "../api/client";
import { useAuth, useCart, useCity, useSaved } from "../contexts/AppContexts";
import { EmptyState, ErrorMessage, LoadingSpinner } from "../components/common/States";
import { ProductImage, QuantitySelector } from "../components/product/ProductCard";
import { ProductGrid } from "../components/product/ProductGrid";
import { formatPrice } from "../utils/format";
import { getGuestSessionId } from "../utils/session";
import { readStorage, storageKeys } from "../utils/storage";
import type { CustomerType, DeliveryMethod, Order, PaymentMethod } from "../types/order.types";

export function FavoritesPage() {
  const auth = useAuth(); const saved = useSaved();
  if (auth.loading) return <LoadingSpinner/>;
  if (!auth.user) return <Navigate to="/login" state={{ from: "/favorites" }} replace/>;
  return <section><h1>Таңдаулы тауарлар</h1>{saved.loading ? <LoadingSpinner/> : saved.error ? <ErrorMessage message={saved.error} retry={() => void saved.refresh().catch(() => undefined)}/> : <ProductGrid list={saved.favorites}/>}</section>;
}

export function ComparePage() {
  const { comparison, clearCompare, toggleCompare, loading, error, refresh } = useSaved();
  const [busy, setBusy] = useState(false); const [actionError, setActionError] = useState("");
  const act = async (action: () => Promise<void>) => { setBusy(true); setActionError(""); try { await action(); } catch (reason) { setActionError(extractApiError(reason)); } finally { setBusy(false); } };
  const attributes = new Map(comparison.flatMap((product) => product.technicalSpecifications.map((attribute) => [attribute.key, attribute] as const)));
  return <section><div className="section-heading"><h1>Тауарларды салыстыру</h1>{comparison.length > 0 && <button className="text-button" disabled={busy} onClick={() => void act(clearCompare)}>Тізімді тазарту</button>}</div>
    {(error || actionError) && <ErrorMessage message={actionError || error} retry={() => void refresh().catch(() => undefined)}/>}
    {loading ? <LoadingSpinner/> : comparison.length ? <div className="comparison"><table><thead><tr><th>Сипаттама</th>{comparison.map((product) => <th key={product.id}><Link to={`/product/${product.slug}`}>{product.name}</Link><button className="text-button" disabled={busy} aria-label={`${product.name} салыстырудан өшіру`} onClick={() => void act(() => toggleCompare(product))}><Trash2 size={16}/></button></th>)}</tr></thead><tbody>
      <tr><th>Бағасы</th>{comparison.map((product) => <td key={product.id}>{formatPrice(product.price)}</td>)}</tr>
      <tr><th>Қолжетімді саны</th>{comparison.map((product) => <td key={product.id}>{product.availableQuantity}</td>)}</tr>
      {[...attributes.values()].map((attribute) => <tr key={attribute.key}><th>{attribute.name}{attribute.unit ? ` (${attribute.unit})` : ""}</th>{comparison.map((product) => { const value = product.technicalSpecifications.find((item) => item.key === attribute.key)?.value; return <td key={product.id}>{value === null || value === undefined ? "—" : String(value)}</td>; })}</tr>)}
    </tbody></table></div> : <EmptyState message="Салыстыруға 4 тауарға дейін қосуға болады."/>}
  </section>;
}

export function CartPage() {
  const { cart, update, remove, clear, loading, error, refresh } = useCart(); const [busy, setBusy] = useState(false); const [actionError, setActionError] = useState("");
  const act = async (action: () => Promise<void>) => { setBusy(true); setActionError(""); try { await action(); } catch (reason) { setActionError(extractApiError(reason)); } finally { setBusy(false); } };
  return <section><div className="section-heading"><h1>Себет{cart?.city ? ` · ${cart.city.name}` : ""}</h1>{Boolean(cart?.items.length) && <button className="text-button" disabled={busy} onClick={() => void act(clear)}>Себетті тазарту</button>}</div>
    {(error || actionError) && <ErrorMessage message={actionError || error} retry={() => void refresh().catch(() => undefined)}/>}
    {loading && !cart ? <LoadingSpinner/> : cart?.items.length ? <div className="cart-layout"><div className="cart-items">{cart.items.map((item) => <article key={item.id}><ProductImage product={item.product}/><div><Link to={`/product/${item.product.slug}`}>{item.product.name}</Link><small>{item.product.sku} · {formatPrice(item.unitPrice)} / {item.product.unit || "дана"}</small><small>Қолжетімді: {item.availableQuantity}</small>{item.warning && <small className="form-error">{item.warning === "INSUFFICIENT_STOCK" ? "Қалдық жеткіліксіз: санын азайтыңыз немесе тауарды өшіріңіз." : "Таңдалған қалада тауар ұсынысы қолжетімсіз."}</small>}</div><QuantitySelector value={item.quantity} disabled={busy || item.availableQuantity === 0} max={item.availableQuantity} onChange={(quantity) => void act(() => update(item.id, quantity))}/><b>{formatPrice(item.lineTotal)}</b><button aria-label={`${item.product.name} себеттен өшіру`} className="icon-only" disabled={busy} onClick={() => void act(() => remove(item.id))}><Trash2 size={18}/></button></article>)}</div>
      <aside className="summary"><h2>Тапсырыс сомасы</h2><p><span>Тауарлар ({cart.totalItemCount})</span><b>{formatPrice(cart.subtotal)}</b></p><p><span>Жеткізу</span><span>Рәсімдеуде есептеледі</span></p><hr/><p className="total"><span>Аралық сома</span><b>{formatPrice(cart.subtotal)}</b></p>{cart.items.some((item) => Boolean(item.warning)) ? <p className="form-error">Рәсімдеу үшін себеттегі ескертулерді түзетіңіз.</p> : <Link className="button" to="/checkout">Рәсімдеуге өту</Link>}</aside>
    </div> : !error && <EmptyState message="Себет бос. Каталогтан қажетті жабдықты таңдаңыз."/>}
  </section>;
}

export function CheckoutPage() {
  const { user, loading } = useAuth();
  if (loading && !user) return <LoadingSpinner/>;
  // A different account/session gets fresh fields and no previous confirmation.
  const identity = user ? `user:${user.id}` : `guest:${getGuestSessionId()}`;
  return <CheckoutForm key={identity} ownerId={user?.id || null}/>;
}

function CheckoutForm({ ownerId }: { ownerId: string | null }) {
  const { cart, refresh, loading, error: cartError } = useCart(); const { user } = useAuth(); const { city } = useCity();
  const [confirmation, setConfirmation] = useState<{ order: Order; ownerId: string | null } | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [customerType, setCustomerType] = useState<CustomerType>("PERSON"); const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("PICKUP");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return;
    if (loading || cart?.city?.slug !== city) { setError("Қала мен себет жаңартылып жатыр. Аяқталған соң қайталап көріңіз."); return; }
    const data = new FormData(event.currentTarget); setBusy(true); setError("");
    const submittedToken = readStorage(storageKeys.token);
    const submittedGuest = ownerId ? null : getGuestSessionId();
    // The storage check also covers the short gap before an auth change commits.
    const stillCurrent = () => mounted.current && readStorage(storageKeys.token) === submittedToken && (submittedGuest === null || getGuestSessionId() === submittedGuest);
    const field = (name: string) => String(data.get(name) || "").trim();
    try {
      const created = await ordersApi.create({ customerName: field("customerName"), phone: field("phone"), email: field("email"), customerType,
        ...(customerType === "COMPANY" ? { companyName: field("companyName"), bin: field("bin") } : {}), deliveryMethod,
        paymentMethod: field("paymentMethod") as PaymentMethod, ...(deliveryMethod === "DELIVERY" ? { deliveryAddress: field("deliveryAddress") } : {}), comment: field("comment") || undefined });
      if (!stillCurrent()) return;
      setConfirmation({ order: created, ownerId });
      // Checkout already cleared the server cart. Do not issue another DELETE.
      await refresh().catch(() => undefined);
    } catch (reason) { if (stillCurrent()) setError(extractApiError(reason)); } finally { if (stillCurrent()) setBusy(false); }
  };
  if (confirmation) {
    const { order } = confirmation;
    return <section className="success"><CheckCircle2 size={48}/><h1>Тапсырысыңыз қабылданды</h1><p>Нөмірі: <b>{order.orderNumber || order.id}</b></p><p>Тауарлар: {formatPrice(order.subtotal)} · Жеткізу: {formatPrice(order.deliveryPrice)} · Барлығы: <b>{formatPrice(order.total)}</b></p><p>Төлем автоматты алынған жоқ.</p>{confirmation.ownerId ? <Link className="button" to={`/account/orders/${order.id}`}>Тапсырысты көру</Link> : <p>Қонақ тапсырысының нөмірін сақтап алыңыз. Ол жеке кабинетте көрсетілмейді.</p>}<Link className="outline-button" to="/catalog">Каталогқа оралу</Link></section>;
  }
  if (loading && !cart) return <LoadingSpinner/>;
  if (cartError && !cart) return <ErrorMessage message={cartError} retry={() => void refresh().catch(() => undefined)}/>;
  if (!cart?.items.length) return <EmptyState message="Рәсімдеу үшін алдымен себетке тауар қосыңыз."/>;
  const warnings = cart.items.some((item) => Boolean(item.warning));
  return <section><h1>Тапсырысты рәсімдеу</h1><form className="checkout-form" onSubmit={(event) => void submit(event)}><div>
    <fieldset><legend>Байланыс деректері</legend><label>Аты-жөні<input required minLength={2} maxLength={150} name="customerName" autoComplete="name" defaultValue={user ? `${user.firstName} ${user.lastName || ""}`.trim() : ""}/></label><label>Телефон<input required minLength={5} maxLength={30} name="phone" type="tel" autoComplete="tel" defaultValue={user?.phone || ""}/></label><label>Email<input required name="email" type="email" autoComplete="email" defaultValue={user?.email || ""}/></label></fieldset>
    <fieldset><legend>Сатып алушы түрі</legend><label><input type="radio" name="customerType" value="PERSON" checked={customerType === "PERSON"} onChange={() => setCustomerType("PERSON")}/>Жеке тұлға</label><label><input type="radio" name="customerType" value="COMPANY" checked={customerType === "COMPANY"} onChange={() => setCustomerType("COMPANY")}/>Заңды тұлға</label>{customerType === "COMPANY" && <><label>Компания атауы<input required maxLength={200} name="companyName"/></label><label>БСН<input required name="bin" inputMode="numeric" pattern="[0-9]{12}" minLength={12} maxLength={12}/></label></>}</fieldset>
    <fieldset><legend>Жеткізу және төлем</legend><p>Қала: {cart.city?.name}</p><label>Жеткізу<select name="deliveryMethod" value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value as DeliveryMethod)}><option value="PICKUP">Өзім алып кетемін</option><option value="DELIVERY">Курьермен жеткізу</option></select></label>{deliveryMethod === "DELIVERY" && <label>Мекенжай<input required maxLength={500} name="deliveryAddress" placeholder="Қала, көше, үй"/></label>}<label>Төлем<select name="paymentMethod"><option value="POS_ON_PICKUP">Алып кету кезіндегі терминал</option><option value="CASH_ON_DELIVERY">Жеткізу кезіндегі қолма-қол төлем</option><option value="BANK_TRANSFER">Шот бойынша аударым</option><option value="ONLINE_CARD">Онлайн карта (провайдер қосылмаған)</option></select></label><label>Түсініктеме<textarea name="comment" maxLength={1000}/></label></fieldset>
  </div><aside className="summary"><h2>Тапсырыс</h2><p>{cart.totalItemCount} тауар</p><p className="total"><span>Аралық сома</span><b>{formatPrice(cart.subtotal)}</b></p><small>Сервер бағаны қайта тексеріп, жеткізу құнын және соңғы соманы есептейді.</small>{warnings && <ErrorMessage message="Себеттегі қалдық/ұсыныс ескертуін түзетіңіз."/>}{error && <ErrorMessage message={error}/>}<button className="button" disabled={busy || warnings || loading || cart.city?.slug !== city}>{busy ? "Рәсімделуде…" : loading || cart.city?.slug !== city ? "Себет жаңартылуда…" : "Тапсырысты растау"}</button><small>Бұл кезеңде нақты төлем алынбайды.</small><Link to="/cart">Себетке оралу</Link></aside></form></section>;
}

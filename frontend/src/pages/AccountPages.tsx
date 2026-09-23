import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth, useLanguage } from "../contexts/AppContexts";
import { usersApi } from "../api/users.api";
import { ordersApi } from "../api/orders.api";
import { extractApiError } from "../api/client";
import { EmptyState, ErrorMessage, LoadingSpinner, useApiResource } from "../components/common/States";
import { formatDate, formatPrice } from "../utils/format";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth(); const location = useLocation();
  if (loading && !user) return <LoadingSpinner/>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace/>;
  return children;
}
const statusNames: Record<string, string> = { NEW: "Жаңа", CONFIRMED: "Расталған", PROCESSING: "Өңделуде", READY: "Дайын", SHIPPED: "Жөнелтілген", COMPLETED: "Аяқталған", CANCELLED: "Тоқтатылған" };

export function AuthPage({ register = false }: { register?: boolean }) {
  const auth = useAuth(); const location = useLocation(); const navigate = useNavigate();
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const from = (location.state as { from?: string } | null)?.from;
  const destination = from?.startsWith("/") && !from.startsWith("//") && !["/login", "/register"].includes(from) ? from : "/account";
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); const field = (key: string) => String(data.get(key) || "");
    try {
      if (register) await auth.register({ email: field("email"), password: field("password"), firstName: field("firstName"), lastName: field("lastName") || undefined, phone: field("phone") || undefined });
      else await auth.login({ email: field("email"), password: field("password") });
      navigate(destination, { replace: true });
    } catch (reason) { setError(extractApiError(reason)); } finally { setBusy(false); }
  };
  if (auth.loading) return <LoadingSpinner/>;
  if (auth.user) return <Navigate to={destination} replace/>;
  return <section className="auth-page"><h1>{register ? "Тіркелу" : "Жүйеге кіру"}</h1><form className="form-stack" onSubmit={(event) => void submit(event)}>
    {register && <><label>Аты<input required name="firstName" minLength={1} maxLength={100} autoComplete="given-name"/></label><label>Тегі<input name="lastName" maxLength={100} autoComplete="family-name"/></label><label>Телефон<input name="phone" minLength={5} maxLength={30} type="tel" autoComplete="tel"/></label></>}
    <label>Email<input required name="email" type="email" autoComplete="email"/></label><label>Құпиясөз<input required name="password" type="password" minLength={8} autoComplete={register ? "new-password" : "current-password"}/></label>
    {error && <ErrorMessage message={error}/>}<button className="button" disabled={busy}>{busy ? "Күтіңіз…" : register ? "Тіркелу" : "Кіру"}</button>
  </form><p>{register ? "Аккаунтыңыз бар ма?" : "Жаңа пайдаланушысыз ба?"} <Link className="text-button" to={register ? "/login" : "/register"} state={{ from: destination }}>{register ? "Кіру" : "Тіркелу"}</Link></p></section>;
}

function AccountContent() {
  const auth = useAuth(); const { language } = useLanguage(); const navigate = useNavigate(); const profile = useApiResource(() => usersApi.me(), [auth.user?.id, language]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(""); setMessage("");
    try { await usersApi.update({ firstName: String(data.get("firstName") || ""), lastName: String(data.get("lastName") || ""), phone: String(data.get("phone") || "") }); await auth.refresh(); profile.reload(); setMessage("Деректер сақталды."); }
    catch (reason) { setError(extractApiError(reason)); } finally { setBusy(false); }
  };
  return <section className="account-page"><div className="section-heading"><h1>Жеке кабинет</h1><button className="text-button" onClick={() => { auth.logout(); navigate("/"); }}>Шығу</button></div><nav className="account-links"><Link to="/account/orders">Тапсырыстарым</Link><Link to="/favorites">Таңдаулылар</Link></nav>
    {profile.loading ? <LoadingSpinner/> : profile.error ? <ErrorMessage message={profile.error} retry={profile.reload}/> : profile.data && <form key={`${profile.data.id}:${profile.data.firstName}:${profile.data.lastName}:${profile.data.phone}`} className="form-stack" onSubmit={(event) => void submit(event)}><label>Email<input type="email" value={profile.data.email} readOnly/></label><label>Аты<input required name="firstName" maxLength={100} defaultValue={profile.data.firstName}/></label><label>Тегі<input name="lastName" maxLength={100} defaultValue={profile.data.lastName || ""}/></label><label>Телефон<input name="phone" type="tel" minLength={5} maxLength={30} defaultValue={profile.data.phone || ""}/></label>{error && <ErrorMessage message={error}/>}<button className="button" disabled={busy}>{busy ? "Сақталуда…" : "Сақтау"}</button></form>}{message && <p role="status">{message}</p>}
  </section>;
}
export function AccountPage() { return <RequireAuth><AccountContent/></RequireAuth>; }

function OrdersContent() {
  const { user } = useAuth(); const { language } = useLanguage(); const resource = useApiResource(() => ordersApi.list(), [user?.id, language]);
  return <section><div className="breadcrumbs"><Link to="/account">Жеке кабинет</Link> / Тапсырыстар</div><h1>Тапсырыстарым</h1>{resource.loading ? <LoadingSpinner/> : resource.error ? <ErrorMessage message={resource.error} retry={resource.reload}/> : resource.data?.length ? <div className="article-list">{resource.data.map((order) => <article key={order.id}><div className="section-heading"><h2><Link to={`/account/orders/${order.id}`}>{order.orderNumber || order.id}</Link></h2><b>{formatPrice(order.total)}</b></div><p>{statusNames[order.status] || order.status} · {formatDate(order.createdAt)}</p><Link className="text-button" to={`/account/orders/${order.id}`}>Толығырақ</Link></article>)}</div> : <EmptyState message="Сізде әзірге тапсырыс жоқ."/>}</section>;
}
export function OrdersPage() { return <RequireAuth><OrdersContent/></RequireAuth>; }

function OrderDetailContent() {
  const { id = "" } = useParams(); const { user } = useAuth(); const { language } = useLanguage(); const resource = useApiResource(() => ordersApi.get(id), [id, user?.id, language]);
  if (resource.loading) return <LoadingSpinner/>;
  if (resource.error) return <section><h1>{resource.status === 404 ? "Тапсырыс табылмады" : "Тапсырысты жүктеу мүмкін болмады"}</h1><ErrorMessage message={resource.error} retry={resource.reload}/><Link to="/account/orders">Тапсырыстарға оралу</Link></section>;
  const order = resource.data; if (!order) return null;
  return <section className="content-page"><div className="breadcrumbs"><Link to="/account/orders">Тапсырыстарым</Link> / {order.orderNumber}</div><h1>{order.orderNumber || order.id}</h1><p>{statusNames[order.status] || order.status} · {formatDate(order.createdAt)}</p><p>{order.customerName} · {order.email} · {order.phone}</p><p>{order.city?.name} · {order.deliveryMethod === "PICKUP" ? "Өзі алып кету" : "Жеткізу"}{order.deliveryAddress ? ` · ${order.deliveryAddress}` : ""}</p><p>Төлем: {order.paymentMethod} · {order.paymentStatus}</p>
    <div className="comparison"><table><thead><tr><th>Тауар</th><th>Саны</th><th>Бірлік бағасы</th><th>Сомасы</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td><Link to={`/product/${item.productSlug}`}>{item.productName}</Link><small className="product-meta"> · {item.sku}</small></td><td>{item.quantity}</td><td>{formatPrice(item.unitPrice)}</td><td>{formatPrice(item.lineTotal)}</td></tr>)}</tbody></table></div>
    <p>Тауарлар: {formatPrice(order.subtotal)}</p><p>Жеткізу: {formatPrice(order.deliveryPrice)}</p><h2>Барлығы: {formatPrice(order.total)}</h2>{order.comment && <p>{order.comment}</p>}
  </section>;
}
export function OrderDetailPage() { return <RequireAuth><OrderDetailContent/></RequireAuth>; }

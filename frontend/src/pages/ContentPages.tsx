import { useState, type FormEvent } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { citiesApi } from "../api/cities.api";
import { newsApi } from "../api/news.api";
import { faqApi } from "../api/faq.api";
import { pagesApi } from "../api/pages.api";
import { requestsApi } from "../api/requests.api";
import { extractApiError } from "../api/client";
import { useAuth, useCity, useLanguage } from "../contexts/AppContexts";
import { EmptyState, ErrorMessage, LoadingSpinner, useApiResource } from "../components/common/States";
import { Pagination } from "../components/product/ProductGrid";
import { formatDate } from "../utils/format";
import { resolveAssetUrl } from "../utils/assets";
import type { RequestType } from "../types/content.types";

export function NewsPage() {
  const [params, setParams] = useSearchParams(); const { language } = useLanguage(); const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
  const resource = useApiResource(() => newsApi.list({ page, limit: 5 }), [page, language]);
  return <section><h1>Жаңалықтар</h1>{resource.loading ? <LoadingSpinner/> : resource.error ? <ErrorMessage message={resource.error} retry={resource.reload}/> : resource.data && <>{resource.data.data.length ? <div className="article-list">{resource.data.data.map((article) => <article key={article.id}><time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time><h2><Link to={`/news/${article.slug}`}>{article.title}</Link></h2><p>{article.excerpt}</p></article>)}</div> : <EmptyState message="Жарияланған жаңалық жоқ."/>}<Pagination value={resource.data.pagination} onChange={(value) => setParams({ page: String(value) })}/></>}</section>;
}
export function NewsDetailPage() {
  const { slug = "" } = useParams(); const { language } = useLanguage(); const resource = useApiResource(() => newsApi.get(slug), [slug, language]);
  if (resource.loading) return <LoadingSpinner/>;
  if (resource.error) return <section><h1>{resource.status === 404 ? "Жаңалық табылмады" : "Жаңалықты жүктеу мүмкін болмады"}</h1><ErrorMessage message={resource.error} retry={resource.reload}/><Link to="/news">Барлық жаңалық</Link></section>;
  const article = resource.data; if (!article) return null;
  return <article className="content-page"><Link to="/news">← Жаңалықтар</Link><h1>{article.title}</h1><time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>{article.imageUrl && <img className="content-image" src={resolveAssetUrl(article.imageUrl) || undefined} alt={article.title}/>}<p className="content-text">{article.content}</p></article>;
}
export function FaqPage() {
  const { language } = useLanguage(); const resource = useApiResource(() => faqApi.list(), [language]);
  return <section><h1>Жиі қойылатын сұрақтар</h1>{resource.loading ? <LoadingSpinner/> : resource.error ? <ErrorMessage message={resource.error} retry={resource.reload}/> : resource.data?.length ? <div className="faq-list">{resource.data.map((item) => <details key={item.id}><summary>{item.question}</summary><p className="content-text">{item.answer}</p></details>)}</div> : <EmptyState message="Сұрақтар әлі жарияланбаған."/>}</section>;
}

export function CustomerRequestForm({ initialType = "GENERAL" }: { initialType?: RequestType }) {
  const { user } = useAuth(); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [sent, setSent] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); const field = (name: string) => String(data.get(name) || "").trim();
    try { await requestsApi.create({ type: field("type") as RequestType, name: field("name"), phone: field("phone"), email: field("email") || undefined, company: field("company") || undefined, message: field("message") || undefined }); setSent(true); }
    catch (reason) { setError(extractApiError(reason)); } finally { setBusy(false); }
  };
  if (sent) return <div className="form-stack"><p role="status">Өтініміңіз қабылданды.</p><button className="outline-button" onClick={() => setSent(false)}>Жаңа өтінім</button></div>;
  return <form className="form-stack request-form" onSubmit={(event) => void submit(event)}><h2>Сұрақ немесе өтінім</h2><label>Түрі<select name="type" defaultValue={initialType}><option value="GENERAL">Жалпы сұрақ</option><option value="CALLBACK">Қайта қоңырау</option><option value="B2B">Заңды тұлғаларға</option><option value="CUSTOM_PANEL">Қалқан жинау</option><option value="COOPERATION">Ынтымақтастық</option></select></label><label>Аты-жөні<input required name="name" minLength={2} maxLength={150} defaultValue={user ? `${user.firstName} ${user.lastName || ""}`.trim() : ""}/></label><label>Телефон<input required name="phone" minLength={5} maxLength={30} type="tel" defaultValue={user?.phone || ""}/></label><label>Email<input name="email" type="email" defaultValue={user?.email || ""}/></label><label>Компания<input name="company" maxLength={200}/></label><label>Хабарлама<textarea name="message" maxLength={3000}/></label>{error && <ErrorMessage message={error}/>}<button className="button" disabled={busy}>{busy ? "Жіберілуде…" : "Жіберу"}</button></form>;
}

export function ContentPage() {
  const { pathname } = useLocation(); const slug = pathname.replace(/^\//, ""); const { language } = useLanguage(); const resource = useApiResource(() => pagesApi.get(slug), [slug, language]);
  if (resource.loading) return <LoadingSpinner/>;
  if (resource.error) return <section><h1>{resource.status === 404 ? "Бет табылмады" : "Бетті жүктеу мүмкін болмады"}</h1><ErrorMessage message={resource.error} retry={resource.reload}/></section>;
  return <section className="content-page"><h1>{resource.data?.title}</h1><p className="content-text">{resource.data?.content}</p>{slug === "b2b" && <CustomerRequestForm initialType="B2B"/>}</section>;
}
export function ContactsPage() {
  const { city } = useCity(); const { language } = useLanguage(); const resource = useApiResource(() => citiesApi.branches(city), [city, language]);
  return <section><h1>Байланыстар мен дүкендер</h1><p className="muted">Таңдалған қаланың филиалдары. Демо каталогтағы байланыс деректері толтырылмаған болуы мүмкін.</p>
    {resource.loading ? <LoadingSpinner/> : resource.error ? <ErrorMessage message={resource.error} retry={resource.reload}/> : resource.data?.length ? <div className="branch-grid">{resource.data.map((branch) => <article key={branch.id}><h2>{branch.name}</h2><p>{branch.address || "Мекенжай көрсетілмеген"}</p>{branch.workingHours && <p>{branch.workingHours}</p>}{[branch.phone1, branch.phone2].filter(Boolean).map((phone) => <a key={phone} href={`tel:${phone}`}>{phone}</a>)}{branch.email && <a href={`mailto:${branch.email}`}>{branch.email}</a>}</article>)}</div> : <EmptyState message="Бұл қалада белсенді филиал жоқ."/>}
    <CustomerRequestForm/>
  </section>;
}
export function NotFoundPage() { return <section className="not-found"><h1>404</h1><p>Бұл бет табылмады.</p><Link className="button" to="/">Басты бетке оралу</Link></section>; }

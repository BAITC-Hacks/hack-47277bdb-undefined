import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { categoriesApi } from "../api/categories.api";
import { brandsApi } from "../api/brands.api";
import { catalogApi } from "../api/catalog.api";
import { productsApi } from "../api/products.api";
import { promotionsApi } from "../api/promotions.api";
import { newsApi } from "../api/news.api";
import { extractApiError } from "../api/client";
import { useCity, useLanguage } from "../contexts/AppContexts";
import { EmptyState, ErrorMessage, LoadingSpinner, useApiResource } from "../components/common/States";
import { Pagination, ProductGrid } from "../components/product/ProductGrid";
import { formatDate } from "../utils/format";
import type { ProductFilters, ProductSort } from "../types/product.types";

const sorts = [
  ["default", "Ұсынылған"], ["popularity_desc", "Танымалдығы: кемуі"], ["popularity_asc", "Танымалдығы: өсуі"],
  ["price_asc", "Бағасы: өсуі"], ["price_desc", "Бағасы: кемуі"], ["name_asc", "Атауы: А–Я"], ["name_desc", "Атауы: Я–А"], ["newest", "Жаңа түскен"],
];
const positiveInt = (value: string | null, fallback: number) => Math.max(1, Number.parseInt(value || "", 10) || fallback);

export function HomePage() {
  const { city } = useCity(); const { language } = useLanguage();
  const resource = useApiResource(async () => {
    const [categories, offers, recent, promotions, news] = await Promise.all([
      categoriesApi.tree(), productsApi.list({ city, isSpecialOffer: true, limit: 4 }), productsApi.list({ city, isNew: true, limit: 4 }), promotionsApi.list(), newsApi.list({ page: 1, limit: 4 }),
    ]);
    return { categories, offers: offers.data, recent: recent.data, promotions, news: news.data };
  }, [city, language]);
  return <>
    <section className="home-hero"><div><p className="eyebrow">ЭЛЕКТР ЖАБДЫҚТАРЫ</p><h1>Жобаңызға қажет жабдық — бір каталогта</h1><p>Автоматика, кабель, жарықтандыру және электр монтажы. Бағасы мен қолжетімділігін қалаңыз бойынша тексеріңіз.</p><Link className="button" to="/catalog">Каталогты ашу</Link></div><aside><b>Жобаға арналған өтінім</b><p>Қажетті жабдық пен тапсырыс туралы сұрағыңызды жіберіңіз.</p><Link to="/b2b">Өтінім беру</Link></aside></section>
    {resource.loading ? <LoadingSpinner/> : resource.error ? <ErrorMessage message={resource.error} retry={resource.reload}/> : resource.data && <>
      <section className="category-strip"><div className="section-heading"><h2>Тауар санаттары</h2></div><div>{resource.data.categories.map((category, index) => <Link key={category.id} to={`/catalog/${category.slug}`}><span className="category-mark">{String(index + 1).padStart(2, "0")}</span>{category.name}<ChevronRight size={17}/></Link>)}</div></section>
      <ProductGrid title="Арнайы ұсыныстар" list={resource.data.offers} link="/catalog?isSpecialOffer=true"/>
      {resource.data.promotions.length ? <section className="promo-row">{resource.data.promotions.map((promotion) => <article key={promotion.id}><span>ДЕМО ҰСЫНЫС</span><h2>{promotion.title}</h2><p>{promotion.description}</p><Link to="/catalog?isSpecialOffer=true">Ұсыныстарды қарау</Link></article>)}</section> : <EmptyState message="Қазір белсенді ұсыныс жоқ."/>}
      <ProductGrid title="Жаңа түскен тауарлар" list={resource.data.recent} link="/catalog?isNew=true"/>
      <section className="advantages"><div><b>Қала бойынша қалдық</b><span>Белсенді қоймалардың қолжетімді саны</span></div><div><b>Өңірлік баға</b><span>Таңдалған қаланың ұсыныстары</span></div><div><b>Демонстрациялық каталог</b><span>Хакатонға арналған синтетикалық деректер</span></div></section>
      <section className="news-preview"><div className="section-heading"><h2>Жаңалықтар</h2><Link to="/news">Барлық жаңалық</Link></div>{resource.data.news.map((article) => <article key={article.id}><time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time><h3><Link to={`/news/${article.slug}`}>{article.title}</Link></h3><p>{article.excerpt}</p></article>)}</section>
    </>}
  </>;
}

export function CatalogPage({ searchMode = false }: { searchMode?: boolean }) {
  const { categorySlug } = useParams(); const [params, setParams] = useSearchParams(); const navigate = useNavigate(); const { city } = useCity(); const { language } = useLanguage();
  const [downloadError, setDownloadError] = useState(""); const [downloading, setDownloading] = useState(false);
  const category = categorySlug || params.get("category") || ""; const brand = params.get("brand") || ""; const q = params.get("q") || "";
  const queryKey = params.toString();
  const metadata = useApiResource(async () => ({ categories: await categoriesApi.list(), brands: await brandsApi.list() }), [language]);
  const filters = useApiResource(() => catalogApi.filters(category, city), [category, city, language], Boolean(category));
  const products = useApiResource(() => {
    const attributes = Object.fromEntries([...params.entries()].filter(([key, value]) => key.startsWith("attr.") && value !== "").map(([key, value]) => [key.slice(5), value]));
    const query: ProductFilters = {
      city, category: category || undefined, brand: brand || undefined, q: q || undefined,
      sort: (sorts.find(([value]) => value === params.get("sort"))?.[0] || "default") as ProductSort, page: positiveInt(params.get("page"), 1), limit: Math.min(100, positiveInt(params.get("limit"), 12)),
      ...(params.get("inStock") ? { inStock: params.get("inStock") === "true" } : {}),
      ...(params.get("isNew") ? { isNew: params.get("isNew") === "true" } : {}),
      ...(params.get("isSpecialOffer") ? { isSpecialOffer: params.get("isSpecialOffer") === "true" } : {}),
      ...(params.get("minPrice") ? { minPrice: Number(params.get("minPrice")) } : {}),
      ...(params.get("maxPrice") ? { maxPrice: Number(params.get("maxPrice")) } : {}),
      ...(Object.keys(attributes).length ? { attributes } : {}),
    };
    return productsApi.list(query);
  }, [category, city, language, queryKey]);
  const apply = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); if (key !== "page") next.delete("page"); setParams(next); };
  const selected = metadata.data?.categories.find((item) => item.slug === category);
  const parent = metadata.data?.categories.find((item) => item.id === selected?.parentId);
  const children = metadata.data?.categories.filter((item) => item.parentId === selected?.id) || [];
  const download = async () => {
    setDownloading(true); setDownloadError("");
    try { const blob = await catalogApi.priceList(city); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `price-list-${city}.xlsx`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (reason) { setDownloadError(extractApiError(reason)); } finally { setDownloading(false); }
  };
  return <section className="catalog-page">
    <div className="breadcrumbs"><Link to="/">Басты бет</Link> / <Link to="/catalog">Каталог</Link>{parent && <> / <Link to={`/catalog/${parent.slug}`}>{parent.name}</Link></>}{selected && <> / {selected.name}</>}</div>
    <div className="section-heading"><h1>{searchMode ? `Іздеу: ${q || "барлық тауар"}` : selected?.name || "Электр жабдықтары каталогы"}</h1><button className="text-button" disabled={downloading} onClick={() => void download()}>{downloading ? "Жүктелуде…" : "XLSX прайс"}</button></div>
    {downloadError && <ErrorMessage message={downloadError}/>}{metadata.error && <ErrorMessage message={metadata.error} retry={metadata.reload}/>}
    {children.length > 0 && <nav className="subcategory-links" aria-label="Ішкі санаттар">{children.map((child) => <Link key={child.id} className="outline-button" to={`/catalog/${child.slug}`}>{child.name}</Link>)}</nav>}
    <div className="catalog-layout"><aside className="filters"><b>Сүзгі</b>
      <label>Санат<select aria-label="Санат" value={category} onChange={(event) => { if (categorySlug) { navigate(event.target.value ? `/catalog/${event.target.value}` : "/catalog"); return; } const next = new URLSearchParams(searchMode && q ? { q } : {}); if (event.target.value) next.set("category", event.target.value); setParams(next); }}><option value="">Барлығы</option>{metadata.data?.categories.map((item) => <option key={item.id} value={item.slug}>{item.parentId ? "— " : ""}{item.name}</option>)}</select></label>
      {categorySlug && <Link className="text-button" to="/catalog">Барлық санатты таңдау</Link>}
      <label>Бренд<select aria-label="Бренд" value={brand} onChange={(event) => apply("brand", event.target.value)}><option value="">Барлығы</option>{(filters.data?.brands || metadata.data?.brands || []).map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
      <label>Ең төмен баға<input aria-label="Ең төмен баға" type="number" min="0" value={params.get("minPrice") || ""} placeholder={filters.data?.minPrice === undefined ? "KZT" : String(filters.data.minPrice)} onChange={(event) => apply("minPrice", event.target.value)}/></label>
      <label>Ең жоғары баға<input aria-label="Ең жоғары баға" type="number" min="0" value={params.get("maxPrice") || ""} placeholder={filters.data?.maxPrice === undefined ? "KZT" : String(filters.data.maxPrice)} onChange={(event) => apply("maxPrice", event.target.value)}/></label>
      {[['inStock', 'Тек қоймада бар'], ['isNew', 'Жаңа өнімдер'], ['isSpecialOffer', 'Арнайы ұсыныстар']].map(([key, label]) => <label className="check-label" key={key}><input type="checkbox" checked={params.get(key) === "true"} onChange={(event) => apply(key, event.target.checked ? "true" : "")}/>{label}</label>)}
      {filters.loading && <LoadingSpinner/>}{filters.error && <ErrorMessage message={filters.error} retry={filters.reload}/>}
      {filters.data?.attributes.map((attribute) => <label key={attribute.key}>{attribute.name}<select aria-label={attribute.name} value={params.get(`attr.${attribute.key}`) || ""} onChange={(event) => apply(`attr.${attribute.key}`, event.target.value)}><option value="">Барлығы</option>{attribute.values.map((value) => <option key={String(value)} value={String(value)}>{String(value)}{attribute.unit ? ` ${attribute.unit}` : ""}</option>)}</select></label>)}
      <button className="text-button" onClick={() => setParams(q ? { q } : {})}>Сүзгілерді тазарту</button>
    </aside><div><div className="catalog-toolbar"><span>{products.data?.pagination.total ?? 0} тауар</span><label className="sr-only" htmlFor="sort-products">Сұрыптау</label><select id="sort-products" value={params.get("sort") || "default"} onChange={(event) => apply("sort", event.target.value)}>{sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Беттегі тауар саны" value={params.get("limit") || "12"} onChange={(event) => apply("limit", event.target.value)}>{[12, 24, 48].map((value) => <option key={value} value={value}>{value} / бет</option>)}</select></div>
      {products.loading ? <LoadingSpinner/> : products.error ? <ErrorMessage message={products.error} retry={products.reload}/> : products.data && <>{children.length > 0 && products.data.data.length === 0 ? <EmptyState message="Тауарларды көру үшін жоғарыдағы ішкі санатты таңдаңыз."/> : <ProductGrid list={products.data.data}/>}<Pagination value={products.data.pagination} onChange={(value) => apply("page", String(value))}/></>}
    </div></div>
  </section>;
}
export function SearchPage() { return <CatalogPage searchMode/>; }

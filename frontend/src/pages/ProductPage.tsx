import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { GitCompareArrows, Heart, MapPin, X } from "lucide-react";
import { productsApi } from "../api/products.api";
import { ordersApi } from "../api/orders.api";
import { extractApiError } from "../api/client";
import { useAuth, useCart, useCity, useLanguage, useSaved } from "../contexts/AppContexts";
import { ErrorMessage, LoadingSpinner, useApiResource } from "../components/common/States";
import { AvailabilityBadge, ProductImage, ProductPrice, QuantitySelector } from "../components/product/ProductCard";
import { ProductGrid } from "../components/product/ProductGrid";
import { resolveAssetUrl } from "../utils/assets";
import type { Product } from "../types/product.types";

function OneClickDialog({ product, quantity, onClose }: { product: Product; quantity: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const { city, cities } = useCity(); const { user } = useAuth();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [sent, setSent] = useState(false);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const values = new FormData(event.currentTarget); const selectedCity = cities.find((item) => item.slug === city);
    if (!selectedCity) { setError("Алдымен қаланы таңдаңыз."); return; }
    setBusy(true); setError("");
    try { await ordersApi.oneClick({ productId: product.id, cityId: selectedCity.id, quantity, customerName: String(values.get("customerName") || ""), phone: String(values.get("phone") || ""), email: String(values.get("email") || "") || undefined }); setSent(true); }
    catch (reason) { setError(extractApiError(reason)); } finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="order-dialog" onCancel={onClose} aria-labelledby="oneclick-title"><div className="section-heading"><h2 id="oneclick-title">Бір басумен тапсырыс</h2><button aria-label="Жабу" className="icon-only" onClick={onClose}><X/></button></div>
    {sent ? <div className="form-stack"><p role="status">Өтінім қабылданды. Бұл өтінім тауарды резервке қоймайды.</p><button className="button" onClick={onClose}>Жабу</button></div> : <form className="form-stack" onSubmit={(event) => void submit(event)}><p>{product.name} · Саны: {quantity}{product.unit ? ` ${product.unit}` : ""}</p><label>Аты-жөні<input required minLength={2} maxLength={150} name="customerName" defaultValue={user ? `${user.firstName} ${user.lastName || ""}`.trim() : ""}/></label><label>Телефон<input required minLength={5} maxLength={30} name="phone" type="tel" defaultValue={user?.phone || ""}/></label><label>Email<input name="email" type="email" defaultValue={user?.email || ""}/></label>{error && <ErrorMessage message={error}/>}<button className="button" disabled={busy}>{busy ? "Жіберілуде…" : "Өтінімді жіберу"}</button></form>}
  </dialog>;
}

export function ProductPage() {
  const { slug = "" } = useParams(); const { city } = useCity(); const { language } = useLanguage(); const { add } = useCart(); const { user } = useAuth();
  const { favorites, comparison, toggleFavorite, toggleCompare } = useSaved(); const navigate = useNavigate(); const location = useLocation();
  const [quantity, setQuantity] = useState(1); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [oneClick, setOneClick] = useState(false); const [image, setImage] = useState<string>();
  const detail = useApiResource(() => productsApi.get(slug, city), [slug, city, language]);
  const product = detail.data;
  const availability = useApiResource(() => productsApi.availability(product!.id, city), [product?.id, city, language], Boolean(product));
  const related = useApiResource(() => productsApi.related(product!.id, city), [product?.id, city, language], Boolean(product));
  useEffect(() => { setQuantity(1); setImage(undefined); setError(""); setMessage(""); setOneClick(false); }, [slug, city]);
  const action = async (callback: () => Promise<void>, success: string) => { setBusy(true); setError(""); setMessage(""); try { await callback(); setMessage(success); } catch (reason) { setError(extractApiError(reason)); } finally { setBusy(false); } };
  if (detail.loading) return <LoadingSpinner/>;
  if (detail.error) return <section><h1>{detail.status === 404 ? "Тауар табылмады" : "Тауарды жүктеу мүмкін болмады"}</h1><ErrorMessage message={detail.error} retry={detail.reload}/><Link to="/catalog">Каталогқа оралу</Link></section>;
  if (!product) return null;
  const available = availability.data?.availableQuantity ?? product.availableQuantity;
  const canBuy = available > 0 && product.price !== null;
  const favorite = favorites.some((item) => item.id === product.id); const compared = comparison.some((item) => item.id === product.id);
  const save = () => { if (!user) { navigate("/login", { state: { from: location.pathname } }); return; } void action(() => toggleFavorite(product), favorite ? "Таңдаулыдан өшірілді" : "Таңдаулыға қосылды"); };
  return <section className="product-page"><div className="breadcrumbs"><Link to="/catalog">Каталог</Link> / <Link to={`/catalog/${product.category.slug}`}>{product.category.name}</Link> / {product.name}</div>
    <div className="product-detail"><div><ProductImage product={{ ...product, primaryImage: image || product.primaryImage }} className="large-image"/>{product.images.length > 1 && <div className="image-thumbnails">{product.images.map((source) => <button key={source} onClick={() => setImage(source)} aria-label="Тауар суретін таңдау"><img src={resolveAssetUrl(source) || undefined} alt={product.name}/></button>)}</div>}</div>
      <div><p className="product-meta">{product.brand?.name || "Бренд көрсетілмеген"} · Артикул: {product.sku}</p>{product.supplierSku && <p className="product-meta">Жеткізуші артикулы: {product.supplierSku}</p>}<h1>{product.name}</h1>
        <AvailabilityBadge product={{ availabilityStatus: availability.data?.availabilityStatus || product.availabilityStatus, availableQuantity: available }}/><p>{product.shortDescription || product.description}</p><ProductPrice product={product}/>
        <div className="purchase-row"><QuantitySelector value={quantity} onChange={setQuantity} max={Math.max(1, available)} disabled={busy || !canBuy}/><button className="button" disabled={busy || !canBuy || quantity > available} onClick={() => void action(() => add(product.id, quantity), "Себетке қосылды")}>Себетке қосу</button><button className="outline-button" disabled={!canBuy || quantity > available} onClick={() => setOneClick(true)}>1 рет басу</button></div>
        <div className="purchase-row saved-actions"><button className="text-button" disabled={busy} aria-pressed={favorite} onClick={save}><Heart size={17}/>{favorite ? "Таңдаулыдан өшіру" : "Таңдаулыға қосу"}</button><button className="text-button" disabled={busy} aria-pressed={compared} onClick={() => void action(() => toggleCompare(product), compared ? "Салыстырудан өшірілді" : "Салыстыруға қосылды")}><GitCompareArrows size={17}/>Салыстыру</button></div>
        {error && <ErrorMessage message={error}/>} {message && <p role="status">{message}</p>}
        <p className="delivery-note"><MapPin size={17}/>{availability.data?.city?.name || city}{product.deliveryEstimateHours ? ` · Болжамды жеткізу: ${product.deliveryEstimateHours} сағат` : ""}</p>
        {availability.loading ? <LoadingSpinner/> : availability.error ? <ErrorMessage message={availability.error} retry={availability.reload}/> : availability.data && <ul className="warehouse-list">{availability.data.warehouses.map((warehouse) => <li key={warehouse.id}>{warehouse.name}: <b>{warehouse.availableQuantity}</b></li>)}</ul>}
      </div>
    </div>
    <section><h2>Техникалық сипаттамалар</h2>{product.technicalSpecifications.length ? <dl className="specs">{product.technicalSpecifications.map((specification) => <div key={specification.key}><dt>{specification.name}</dt><dd>{specification.value === null ? "—" : String(specification.value)} {specification.unit}</dd></div>)}</dl> : <p className="muted">Сипаттамалар әлі қосылмаған.</p>}{product.description && <p className="content-text">{product.description}</p>}
      <div className="document-links">{product.certificateUrl && <a href={resolveAssetUrl(product.certificateUrl) || undefined} target="_blank" rel="noreferrer">Сертификат</a>}{product.manualUrl && <a href={resolveAssetUrl(product.manualUrl) || undefined} target="_blank" rel="noreferrer">Нұсқаулық</a>}</div>
    </section>
    {related.loading ? <LoadingSpinner/> : related.error ? <ErrorMessage message={related.error} retry={related.reload}/> : <ProductGrid title="Ұқсас тауарлар" list={related.data || []}/>}
    {oneClick && <OneClickDialog product={product} quantity={quantity} onClose={() => setOneClick(false)}/>}
  </section>;
}

import { useState } from "react";
import { GitCompareArrows, Heart, Package, ShoppingCart } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { Product } from "../../types/product.types";
import { useAuth, useCart, useSaved } from "../../contexts/AppContexts";
import { extractApiError } from "../../api/client";
import { formatPrice } from "../../utils/format";
import { resolveAssetUrl } from "../../utils/assets";

export function AvailabilityBadge({ product }: { product: Pick<Product, "availabilityStatus" | "availableQuantity"> }) {
  const label = product.availableQuantity > 0 ? `Қоймада: ${product.availableQuantity}` : product.availabilityStatus === "ON_ORDER" ? "Тапсырыспен" : "Уақытша жоқ";
  return <span className={`availability ${(product.availabilityStatus || "OUT_OF_STOCK").toLowerCase()}`}>{label}</span>;
}
export function ProductImage({ product, className = "" }: { product: { name: string; primaryImage?: string | null; image?: string | null }; className?: string }) {
  const source = resolveAssetUrl(product.primaryImage || product.image);
  const [failed, setFailed] = useState<string | undefined>();
  return <div className={`product-image ${className}`}>{source && failed !== source ? <img src={source} alt={product.name} loading="lazy" onError={() => setFailed(source)}/> : <Package size={48} strokeWidth={1.35} aria-hidden="true"/>}</div>;
}
export function ProductPrice({ product }: { product: Pick<Product, "price" | "storePrice"> }) {
  return <div className="price"><strong>{product.price === null ? "Баға қолжетімсіз" : formatPrice(product.price)}</strong>{product.storePrice !== null && product.storePrice !== undefined && product.price !== null && product.storePrice > product.price ? <del>{formatPrice(product.storePrice)}</del> : null}</div>;
}
export function QuantitySelector({ value, onChange, max, disabled = false }: { value: number; onChange: (value: number) => void; max?: number; disabled?: boolean }) {
  return <div className="quantity"><button type="button" disabled={disabled || value <= 1} aria-label="Азайту" onClick={() => onChange(Math.max(1, Math.min(value - 1, max && max > 0 ? max : value - 1)))}>−</button><output>{value}</output><button type="button" disabled={disabled || (max !== undefined && value >= max)} aria-label="Көбейту" onClick={() => onChange(value + 1)}>+</button></div>;
}
export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart(); const { user } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const { favorites, comparison, toggleFavorite, toggleCompare } = useSaved();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [added, setAdded] = useState(false);
  const favorite = favorites.some((item) => item.id === product.id); const compared = comparison.some((item) => item.id === product.id);
  const act = async (action: () => Promise<void>, cartAction = false) => {
    setBusy(true); setError(""); setAdded(false);
    try { await action(); if (cartAction) setAdded(true); } catch (reason) { setError(extractApiError(reason)); } finally { setBusy(false); }
  };
  const save = () => { if (!user) { navigate("/login", { state: { from: location.pathname + location.search } }); return; } void act(() => toggleFavorite(product)); };
  return <article className="product-card">
    <div className="card-top">{product.isSpecialOffer ? <span className="badge offer">Акция</span> : product.isNew ? <span className="badge">Жаңа</span> : <span/>}<div className="icon-actions">
      <button aria-label={favorite ? "Таңдаулыдан алып тастау" : "Таңдаулыға қосу"} aria-pressed={favorite} disabled={busy} className={favorite ? "active" : ""} onClick={save}><Heart size={18}/></button>
      <button aria-label={compared ? "Салыстырудан алып тастау" : "Салыстыруға қосу"} aria-pressed={compared} disabled={busy} className={compared ? "active" : ""} onClick={() => void act(() => toggleCompare(product))}><GitCompareArrows size={18}/></button>
    </div></div>
    <Link to={`/product/${product.slug}`} className="product-image-link"><ProductImage product={product}/></Link>
    <p className="product-meta">{product.brand?.name || "Бренд көрсетілмеген"} · {product.sku}</p><h3><Link to={`/product/${product.slug}`}>{product.name}</Link></h3>
    <AvailabilityBadge product={product}/><ProductPrice product={product}/>
    <button className="button add-button" disabled={busy || product.availableQuantity < 1 || product.price === null} onClick={() => void act(() => add(product.id, 1), true)}><ShoppingCart size={17}/>{busy ? "Күтіңіз…" : "Себетке қосу"}</button>
    {added && <small role="status">Себетке қосылды</small>}{error && <small className="form-error" role="alert">{error}</small>}
  </article>;
}

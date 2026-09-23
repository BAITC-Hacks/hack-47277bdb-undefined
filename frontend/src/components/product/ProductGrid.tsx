import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Product } from "../../types/product.types";
import type { Pagination as PaginationData } from "../../types/api.types";
import { ProductCard } from "./ProductCard";
import { EmptyState } from "../common/States";

export function ProductGrid({ title, list, link = "/catalog" }: { title?: string; list: Product[]; link?: string }) {
  return <section className={title ? "product-section" : undefined}>{title && <div className="section-heading"><h2>{title}</h2><Link to={link}>Барлығын көру <ChevronRight size={16}/></Link></div>}{list.length ? <div className="product-grid">{list.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <EmptyState message="Тауар табылмады."/>}</section>;
}
export function Pagination({ value, onChange }: { value: PaginationData; onChange: (page: number) => void }) {
  if (value.totalPages < 2) return null;
  return <nav className="pagination" aria-label="Беттер"><button className="outline-button" disabled={value.page <= 1} onClick={() => onChange(value.page - 1)}>Алдыңғы</button><span>{value.page} / {value.totalPages} · {value.total} жазба</span><button className="outline-button" disabled={value.page >= value.totalPages} onClick={() => onChange(value.page + 1)}>Келесі</button></nav>;
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("kk-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(value);
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Баға көрсетілмеген';
  return new Intl.NumberFormat("kk-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(value);
}

export function formatDate(value: string | null | undefined, language: 'kk' | 'ru' = 'kk'): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-KZ' : 'kk-KZ', {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(date);
}

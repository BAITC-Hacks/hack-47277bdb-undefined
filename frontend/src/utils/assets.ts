export function resolveAssetUrl(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  try {
    const api = new URL(import.meta.env.VITE_API_URL || '/api', window.location.origin);
    // The actual upload route is /api/uploads/:filename. Preserve server paths;
    // do not append another /api or guess a /uploads static mount.
    const url = new URL(path, `${api.origin}/`);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

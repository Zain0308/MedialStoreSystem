interface RuntimeConfig { apiBaseUrl?: string; }
declare global { interface Window { medicalStoreConfig?: RuntimeConfig; } }

export function apiUrl(path: string): string {
  const origin = (window.medicalStoreConfig?.apiBaseUrl ?? '').replace(/\/$/, '');
  return `${origin}/api${path}`;
}

export function isApiUrl(url: string): boolean {
  const base = (window.medicalStoreConfig?.apiBaseUrl ?? '').replace(/\/$/, '');
  return url.startsWith(`${base}/api/`) || (!base && url.startsWith('/api/'));
}

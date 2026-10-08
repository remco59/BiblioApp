import { createApiClient } from '@biblio/api-client';

let csrfToken: string | null = null;
export const setCsrfToken = (t: string | null) => {
  csrfToken = t;
};

export const api = createApiClient(window.location.origin);
api.use({
  onRequest({ request }) {
    if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      request.headers.set('X-CSRF-Token', csrfToken);
    }
    return request;
  },
});

/** Haalt een leesbare foutmelding uit een API-fout. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message;
    return Array.isArray(m) ? m.join(', ') : String(m);
  }
  return 'Er ging iets mis';
}

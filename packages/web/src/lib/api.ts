/** API base URL that respects the Vite base path (e.g. /invoice-extractor/api in production) */
export const API_BASE = `${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/api`;

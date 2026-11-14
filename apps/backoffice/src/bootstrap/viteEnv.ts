/**
 * Único acceso a `import.meta.env` (Vite). Jest no lo entiende: en las pruebas se reemplaza por
 * `test/viteEnv.ts`. Las variables `VITE_*` son públicas: nunca secretos.
 */
export const viteEnv: Record<string, string | undefined> = {
  VITE_API_URL: import.meta.env.VITE_API_URL as string | undefined,
  VITE_AUTH_MODE: import.meta.env.VITE_AUTH_MODE as string | undefined,
  VITE_HTTP_TIMEOUT_MS: import.meta.env.VITE_HTTP_TIMEOUT_MS as string | undefined,
  VITE_OIDC_ISSUER: import.meta.env.VITE_OIDC_ISSUER as string | undefined,
  VITE_OIDC_CLIENT_ID: import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined,
  VITE_OIDC_REDIRECT_URI: import.meta.env.VITE_OIDC_REDIRECT_URI as string | undefined,
};

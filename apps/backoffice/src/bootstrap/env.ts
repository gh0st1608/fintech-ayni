import { z } from 'zod';

const schema = z.object({
  VITE_API_URL: z.url({ message: 'VITE_API_URL debe ser la URL del backend' }),
  // "oidc" llega con el proveedor de identidad del personal (BO2); hasta entonces, solo dev.
  VITE_AUTH_MODE: z.enum(['dev'], { message: 'VITE_AUTH_MODE admite solo "dev" por ahora' }),
  VITE_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
});

export interface AppConfig {
  apiUrl: string;
  authMode: 'dev';
  httpTimeoutMs: number;
}

/** Valida la configuración al arrancar y falla con un mensaje claro (base técnica §15). */
export function parseConfig(source: Record<string, string | undefined>): AppConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `- ${issue.message}`).join('\n');
    throw new Error(`Configuración inválida del back-office:\n${problems}`);
  }
  return {
    apiUrl: parsed.data.VITE_API_URL,
    authMode: parsed.data.VITE_AUTH_MODE,
    httpTimeoutMs: parsed.data.VITE_HTTP_TIMEOUT_MS,
  };
}

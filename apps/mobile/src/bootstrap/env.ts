import { z } from 'zod';

const envSchema = z.object({
  appEnv: z.enum(['dev', 'staging', 'prod']).default('dev'),
  apiUrl: z.url(),
  defaultLanguage: z.string().min(2).default('es'),
  defaultCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code')
    .default('PEN'),
  httpTimeoutMs: z.coerce.number().int().positive().default(15000),
});

export type Env = z.infer<typeof envSchema>;

type RawEnv = { [K in keyof Env]?: string };

/** Valida la configuración y falla indicando qué variables son inválidas, sin mostrar valores. */
export function parseEnv(raw: RawEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid configuration: ${fields}. Check .env.local (see .env.example).`);
  }
  return result.data;
}

/** Expo solo incrusta accesos estáticos a process.env.EXPO_PUBLIC_*, por eso se listan uno a uno. */
export function loadEnv(): Env {
  return parseEnv({
    appEnv: process.env.EXPO_PUBLIC_APP_ENV,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    defaultLanguage: process.env.EXPO_PUBLIC_DEFAULT_LANGUAGE,
    defaultCurrency: process.env.EXPO_PUBLIC_DEFAULT_CURRENCY,
    httpTimeoutMs: process.env.EXPO_PUBLIC_HTTP_TIMEOUT_MS,
  });
}

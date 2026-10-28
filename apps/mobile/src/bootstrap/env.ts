import { z } from 'zod';

/** Las variables vacías del .env cuentan como no definidas. */
const optionalHttpsUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.url({ protocol: /^https$/ }).optional(),
);

const envSchema = z
  .object({
    appEnv: z.enum(['dev', 'staging', 'prod']).default('dev'),
    apiUrl: z.url(),
    defaultLanguage: z.string().min(2).default('es'),
    defaultCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code')
      .default('PEN'),
    httpTimeoutMs: z.coerce.number().int().positive().default(15000),
    /** fake: adaptador en memoria mientras no exista el backend; solo se admite en dev. */
    authApi: z.enum(['http', 'fake']).default('http'),
    /** Igual que authApi, para círculos y configuración de unión (E3). */
    circlesApi: z.enum(['http', 'fake']).default('http'),
    /** Igual que authApi, para el perfil del usuario (PATCH /me). */
    profileApi: z.enum(['http', 'fake']).default('http'),
    termsUrl: optionalHttpsUrl,
    privacyUrl: optionalHttpsUrl,
  })
  .refine((env) => env.authApi === 'http' || env.appEnv === 'dev', {
    path: ['authApi'],
    message: 'fake is only allowed in dev',
  })
  .refine((env) => env.circlesApi === 'http' || env.appEnv === 'dev', {
    path: ['circlesApi'],
    message: 'fake is only allowed in dev',
  })
  .refine((env) => env.profileApi === 'http' || env.appEnv === 'dev', {
    path: ['profileApi'],
    message: 'fake is only allowed in dev',
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
    authApi: process.env.EXPO_PUBLIC_AUTH_API,
    circlesApi: process.env.EXPO_PUBLIC_CIRCLES_API,
    profileApi: process.env.EXPO_PUBLIC_PROFILE_API,
    termsUrl: process.env.EXPO_PUBLIC_TERMS_URL,
    privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL,
  });
}

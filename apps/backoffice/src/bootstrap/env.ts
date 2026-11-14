import { z } from 'zod';

const schema = z
  .object({
    VITE_API_URL: z.url({ message: 'VITE_API_URL debe ser la URL del backend' }),
    VITE_AUTH_MODE: z.enum(['dev', 'oidc'], {
      message: 'VITE_AUTH_MODE debe ser "dev" o "oidc"',
    }),
    VITE_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
    VITE_OIDC_ISSUER: z.url().optional(),
    VITE_OIDC_CLIENT_ID: z.string().min(1).optional(),
    VITE_OIDC_REDIRECT_URI: z.url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.VITE_AUTH_MODE === 'oidc') {
      if (!data.VITE_OIDC_ISSUER)
        ctx.addIssue({
          code: 'custom',
          message: 'VITE_OIDC_ISSUER es requerida en modo oidc',
          path: ['VITE_OIDC_ISSUER'],
        });
      if (!data.VITE_OIDC_CLIENT_ID)
        ctx.addIssue({
          code: 'custom',
          message: 'VITE_OIDC_CLIENT_ID es requerida en modo oidc',
          path: ['VITE_OIDC_CLIENT_ID'],
        });
      if (!data.VITE_OIDC_REDIRECT_URI)
        ctx.addIssue({
          code: 'custom',
          message: 'VITE_OIDC_REDIRECT_URI es requerida en modo oidc',
          path: ['VITE_OIDC_REDIRECT_URI'],
        });
    }
  });

export type AuthMode = 'dev' | 'oidc';

export interface OidcConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
}

export interface AppConfig {
  apiUrl: string;
  authMode: AuthMode;
  httpTimeoutMs: number;
  oidc?: OidcConfig;
}

/** Valida la configuración al arrancar y falla con un mensaje claro (base técnica §15). */
export function parseConfig(source: Record<string, string | undefined>): AppConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `- ${issue.message}`).join('\n');
    throw new Error(`Configuración inválida del back-office:\n${problems}`);
  }
  const { data } = parsed;
  const oidc =
    data.VITE_AUTH_MODE === 'oidc'
      ? {
          issuer: data.VITE_OIDC_ISSUER ?? '',
          clientId: data.VITE_OIDC_CLIENT_ID ?? '',
          redirectUri: data.VITE_OIDC_REDIRECT_URI ?? '',
        }
      : undefined;
  return {
    apiUrl: data.VITE_API_URL,
    authMode: data.VITE_AUTH_MODE,
    httpTimeoutMs: data.VITE_HTTP_TIMEOUT_MS,
    oidc,
  };
}

import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

import {
  Cadence,
  CADENCE_IDS,
  type CadenceId,
} from '../modules/circles/domain/value-objects/cadence';
import { MAX_CIRCLE_TURNS } from '../modules/circles/domain/value-objects/turn-options';
import { dueSoonByCadenceFrom } from '../modules/notifications/domain/due-soon-lead';
import { currencySettingsFrom } from '../shared/infrastructure/currency/currency-settings';

/** Identidad del personal del back-office (docs/backoffice-plan.md, BO2). */
export const STAFF_AUTH_PROVIDERS = ['unconfigured', 'oidc', 'dev'] as const;

/** Resultados del proveedor de KYC simulado (COPAYNI-42). */
export const KYC_SIMULATED_RESULTS = ['approved', 'rejected', 'in_review'] as const;
/** Almacenamiento de documentos KYC (COPAYNI-43). */
export const DOCUMENT_STORAGES = ['simulated', 's3'] as const;
/** Verificación de documentos (COPAYNI-42): simulada o revisión manual de operaciones. */
export const KYC_PROVIDERS = ['simulated', 'manual', 'verificaid'] as const;

/** Proveedor del aviso en el celular (COPAYNI-85, T7). */
export const PUSH_PROVIDERS = ['fake', 'expo'] as const;

/**
 * Payout máximo, en unidades menores, que se admite sin verificación biométrica de identidad
 * (P4 de pending-scope §3.2). Por encima, la exposición por impago supera lo que la revisión
 * manual de documentos puede sostener y se exige `KYC_PROVIDER=verificaid`.
 */
export const PAYOUT_MAX_WITHOUT_BIOMETRIC_KYC = 600_000;

/** Envío del OTP (pending-scope T6): ninguno o AWS (SES y End User Messaging SMS). */
export const OTP_DELIVERIES = ['none', 'aws'] as const;

/** Pasarelas de pago admitidas (COPAYNI-34). */
export const PAYMENT_GATEWAYS = ['fake', 'mercadopago'] as const;

export const NODE_ENVS = ['development', 'test', 'production'] as const;
/** Igual que `CYCLE_PAYMENTS_ADAPTERS` del módulo de círculos (COPAYNI-56). */
export const CYCLE_PAYMENTS_ADAPTERS = ['fake'] as const;
export type CyclePaymentsAdapter = (typeof CYCLE_PAYMENTS_ADAPTERS)[number];
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
export const CIRCLE_ASSIGNMENT_STRATEGIES = ['fill_oldest', 'always_new'] as const;
/** Igual que `ADMIN_FEE_MODES` del dominio de círculos (pending-scope R4). */
export const ADMIN_FEE_MODES = ['added_to_installments', 'deducted_from_payout'] as const;
/** Igual que `PAYOUT_METHOD_TYPES` del dominio de payouts (COPAYNI-95). */
export const PAYOUT_METHOD_TYPES = ['bank_account', 'wallet'] as const;
/** Cómo se trata el National ID al unirse mientras no exista el KYC (COPAYNI-47). */
export const JOIN_IDENTITY_CHECKS = ['assume_verified', 'assume_unverified'] as const;

interface RawValue {
  key: string;
  obj: Record<string, unknown>;
  value: unknown;
}

/**
 * Las transformaciones leen el valor original (`obj[key]`): la conversión implícita de
 * class-transformer convertiría "false" en `true`.
 */
const raw = ({ key, obj, value }: RawValue): unknown => (key in obj ? obj[key] : value);

/** "true"/"false" a boolean; cualquier otro valor se deja tal cual para que falle la validación. */
const toBoolean = (params: RawValue): unknown => {
  const value = raw(params);
  return value === 'true' ? true : value === 'false' ? false : value;
};

/** Lista separada por comas; vacía si no hay valores. */
const toList = (params: RawValue): unknown => {
  const value = raw(params);
  return typeof value === 'string'
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : value;
};

/** Lista de enteros separada por comas; un elemento no numérico queda como NaN y falla IsInt. */
const toIntList = (params: RawValue): unknown => {
  const list = toList(params);
  return Array.isArray(list) ? list.map(Number) : list;
};

/**
 * Variables de entorno admitidas. Se validan al arrancar: con un valor inválido la API
 * no inicia. Los montos van en unidades menores de `DEFAULT_CURRENCY`.
 */
export class EnvironmentVariables {
  // Cada propiedad lleva su tipo explícito: la conversión implícita usa el tipo emitido por
  // emitDecoratorMetadata, que no existe para tipos inferidos del valor por defecto.
  @IsIn(NODE_ENVS)
  NODE_ENV: (typeof NODE_ENVS)[number] = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  APP_NAME: string = 'ayni-api';

  @IsString()
  @IsNotEmpty()
  APP_VERSION: string = '0.1.0';

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: (typeof LOG_LEVELS)[number] = 'info';

  /** Orígenes web permitidos. La app mobile no usa CORS; vacío = ningún origen web. */
  @Transform(toList)
  @IsUrl({ require_tld: false, require_protocol: true }, { each: true })
  @ArrayUnique()
  CORS_ALLOWED_ORIGINS: string[] = [];

  /** Detrás de API Gateway o un balanceador, para que el rate limit use la IP real. */
  @Transform(toBoolean)
  @IsBoolean()
  TRUST_PROXY: boolean = false;

  /** Tiempo máximo de una petición, en milisegundos. */
  @IsInt()
  @Min(1000)
  REQUEST_TIMEOUT: number = 30000;

  /** Tamaño máximo del cuerpo JSON (formato de body-parser, p. ej. "100kb"). */
  @Matches(/^\d+(b|kb|mb)$/)
  BODY_LIMIT: string = '100kb';

  @IsInt()
  @Min(1000)
  RATE_LIMIT_TTL: number = 60000;

  @IsInt()
  @Min(1)
  RATE_LIMIT_MAX: number = 100;

  /** Ventana del rate limit de `/admin`, en milisegundos. */
  @IsInt()
  @Min(1000)
  ADMIN_RATE_LIMIT_TTL: number = 60000;

  /**
   * Tope de `/admin` por IP y ventana, agregado para toda la API de administración. Más bajo que
   * el público: lo usa el personal, no miles de personas (COPAYNI-74).
   */
  @IsInt()
  @Min(1)
  ADMIN_RATE_LIMIT_MAX: number = 300;

  @Transform(toBoolean)
  @IsBoolean()
  ENABLE_SWAGGER: boolean = false;

  /** Ambiente en las trazas, métricas y logs (`deployment.environment.name`): local, dev, prod… */
  @Matches(/^[a-z][a-z0-9-]*$/)
  DEPLOYMENT_ENVIRONMENT: string = 'local';

  /** Exporta trazas por OTLP. Sin exportar, las trazas igual existen para correlacionar logs. */
  @Transform(toBoolean)
  @IsBoolean()
  ENABLE_TRACING: boolean = false;

  /** Exporta métricas (duración de peticiones HTTP) por OTLP. */
  @Transform(toBoolean)
  @IsBoolean()
  ENABLE_METRICS: boolean = false;

  /** Exporta los logs por OTLP. Los logs JSON por stdout se escriben siempre. */
  @Transform(toBoolean)
  @IsBoolean()
  ENABLE_LOGGING: boolean = false;

  /**
   * Endpoint OTLP/HTTP base, sin `/v1/traces`. Obligatorio si se exporta alguna señal. Para
   * New Relic depende de la región de la cuenta (README).
   */
  @ValidateIf((env: EnvironmentVariables) => exportsTelemetry(env))
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;

  /** License key de ingesta de New Relic (cabecera `api-key`). Es un secreto: nunca se registra. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  NEW_RELIC_LICENSE_KEY?: string;

  /** Moneda de operación (pending-scope M1). Sin valor por defecto: se decide por ambiente. */
  @Matches(/^[A-Z]{3}$/, { message: 'DEFAULT_CURRENCY debe ser un código ISO 4217' })
  DEFAULT_CURRENCY!: string;

  /**
   * Monedas en las que se puede abrir un Game'ya (pending-scope M2), separadas por comas. Vacía:
   * solo `DEFAULT_CURRENCY`. Otra moneda se habilita cuando la pasarela confirme que cobra en ella.
   */
  @Transform(toList)
  @ArrayUnique()
  @Matches(/^[A-Z]{3}$/, { each: true, message: 'SUPPORTED_CURRENCIES admite códigos ISO 4217' })
  SUPPORTED_CURRENCIES: string[] = [];

  /**
   * Tipos de cambio fijos que actualiza el equipo (pending-scope M2 y M6): `USD:3.75` = 1 USD vale
   * 3,75 de `DEFAULT_CURRENCY`. Hasta 6 decimales. Cada moneda admitida distinta de la oficial
   * necesita el suyo: con él se derivan sus montos equivalentes.
   */
  @Transform(toList)
  @ArrayUnique()
  @Matches(/^[A-Z]{3}:\d{1,9}(\.\d{1,6})?$/, {
    each: true,
    message: 'EXCHANGE_RATES admite entradas MONEDA:tasa, p. ej. USD:3.75',
  })
  EXCHANGE_RATES: string[] = [];

  @IsInt()
  JOIN_PAYOUT_MIN!: number;

  @IsInt()
  JOIN_PAYOUT_MAX!: number;

  @IsInt()
  JOIN_PAYOUT_STEP!: number;

  @IsInt()
  SAVING_PROGRAM_MAX!: number;

  /** Duraciones del Game'ya en meses, separadas por comas (Monthly Pay-in, 55:9334). */
  @Transform(toIntList)
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(2, { each: true })
  CIRCLE_DURATION_OPTIONS!: number[];

  /**
   * Turnos mínimo y máximo que puede elegir el usuario (COPAYNI-125). Con los dos puestos, el
   * rango sustituye a `CIRCLE_DURATION_OPTIONS`; sin ellos rige la lista, que es lo que hay hoy
   * en producción. Conviven porque ningún rango reproduce exactamente `6,10,12`: activar el rango
   * cambia lo que se ofrece, y eso se despliega cuando negocio lo decida, no al desplegar código.
   */
  @IsOptional()
  @IsInt()
  @Min(2)
  CIRCLE_TURNS_MIN?: number;

  @IsOptional()
  @IsInt()
  @Max(MAX_CIRCLE_TURNS)
  CIRCLE_TURNS_MAX?: number;

  /**
   * Cadencias de junta que se pueden crear, separadas por comas (COPAYNI-121). Separa el
   * despliegue del código de la activación de la funcionalidad: con el valor por defecto el
   * producto se comporta como antes de admitir cadencias. `monthly` no se puede quitar, porque
   * es la de todos los círculos que existen.
   */
  @Transform(toList)
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(CADENCE_IDS, { each: true })
  CIRCLE_CADENCES_ENABLED: CadenceId[] = ['monthly'];

  /**
   * Cómo se elige el círculo cuyos slots se ofrecen (pending-scope R2, provisional):
   * `fill_oldest` completa el círculo abierto más antiguo que aún no empezó; `always_new` ofrece
   * siempre uno nuevo.
   */
  @IsIn(CIRCLE_ASSIGNMENT_STRATEGIES)
  CIRCLE_ASSIGNMENT_STRATEGY: (typeof CIRCLE_ASSIGNMENT_STRATEGIES)[number] = 'fill_oldest';

  /** Meses entre el mes actual y el inicio de un círculo nuevo. */
  @IsInt()
  @Min(1)
  @Max(12)
  CIRCLE_START_OFFSET_MONTHS: number = 1;

  /** Círculos recomendados en Home y en Circles vacío (COPAYNI-25, criterio provisional). */
  @IsInt()
  @Min(1)
  @Max(20)
  RECOMMENDED_CIRCLES_LIMIT: number = 5;

  /**
   * Día del mes en que vence cada cuota (COPAYNI-56; pending-scope R19, provisional). Hasta 28
   * para que exista en todos los meses.
   */
  @IsInt()
  @Min(1)
  @Max(28)
  CIRCLE_INSTALLMENT_DUE_DAY: number = 1;

  /** Días corridos de gracia después del vencimiento de una cuota (COPAYNI-57, decidido por el PO). */
  @IsInt()
  @Min(0)
  @Max(28)
  DELINQUENCY_GRACE_DAYS: number = 3;

  /**
   * Gracia y mora de las cadencias distintas de la mensual (COPAYNI-111), como
   * `weekly:1,biweekly:2` y `weekly:150`. Las variables de arriba son los valores de la cadencia
   * mensual, que no cambian.
   *
   * Hacen falta porque el riesgo no es el mismo: con 3 días de gracia no hay solape con la cuota
   * siguiente ni en una junta semanal, pero sí hay 52 ocasiones anuales de incurrir en mora en
   * lugar de 12, y un cargo del 3 % aplicado 52 veces al año sobre el mismo capital en lugar de
   * 12. Los valores definitivos los decide riesgo y finanzas (COPAYNI-102); la estructura existe
   * para que no se habilite una cadencia sin ellos.
   */
  @Transform(toList)
  @ArrayUnique()
  @Matches(/^(monthly|biweekly|weekly):\d{1,2}$/, {
    each: true,
    message: 'DELINQUENCY_GRACE_DAYS_BY_CADENCE admite entradas cadencia:días, p. ej. weekly:1',
  })
  DELINQUENCY_GRACE_DAYS_BY_CADENCE: string[] = [];

  @Transform(toList)
  @ArrayUnique()
  @Matches(/^(monthly|biweekly|weekly):\d{1,5}$/, {
    each: true,
    message: 'LATE_FEE_BPS_BY_CADENCE admite entradas cadencia:bps, p. ej. weekly:150',
  })
  LATE_FEE_BPS_BY_CADENCE: string[] = [];

  /**
   * Cargo por mora sobre la cuota vencida, cobrado una vez, en puntos básicos (R18, propuesto:
   * 3 %). Legal debe validar el tope del interés moratorio antes de producción.
   */
  @IsInt()
  @Min(0)
  @Max(10000)
  LATE_FEE_BPS: number = 300;

  /**
   * Penalidad sobre lo pagado que se descuenta de la devolución al expulsado antes de su turno,
   * en puntos básicos. El PO la fijó como mínimo en 5 %.
   */
  @IsInt()
  @Min(500)
  @Max(10000)
  EXPULSION_REFUND_PENALTY_BPS: number = 500;

  /**
   * Parte de las Admin Fees de quien cobra que va al fondo de garantía (COPAYNI-58, R16), en
   * puntos básicos. 50 % desde P2 de pending-scope §3.2; rango de operación sugerido 3000–5000.
   */
  @IsInt()
  @Min(0)
  @Max(10000)
  GUARANTEE_FUND_FEE_SHARE_BPS: number = 5000;

  /** Saldo mínimo del fondo en cuotas base por círculo en curso; debajo, alerta (R18, propuesto). */
  @IsInt()
  @Min(0)
  @Max(12)
  GUARANTEE_FUND_MIN_INSTALLMENTS_PER_CIRCLE: number = 2;

  /**
   * Horas para firmar el contrato y el pagaré antes de que el turno se libere (COPAYNI-89).
   * 48 h por decisión del PO; la tarea diaria procesa los vencidos.
   */
  @IsInt()
  @Min(1)
  @Max(720)
  AGREEMENT_SIGNATURE_TTL_HOURS: number = 48;

  /**
   * Círculos completados sin expulsión que pide un turno Fastest Payout (COPAYNI-60, R18). 0 al
   * lanzar (P10 de pending-scope §3.2): nadie tiene historial todavía y exigir 1 dejaría esos
   * turnos vacíos. El riesgo lo compensa el tope bajo de `JOIN_PAYOUT_MAX`.
   */
  @IsInt()
  @Min(0)
  @Max(12)
  TRUST_FASTEST_MIN_COMPLETED_CIRCLES: number = 0;

  /**
   * Días de cobertura que retiene el payout de cada turno, y que pagan sus últimas cuotas
   * (COPAYNI-60; proporcional desde P1/P5 de pending-scope §3.2). 0 desactiva la retención.
   *
   * Va en días y no en número de cuotas (COPAYNI-112) porque el mismo número dejaba de significar
   * lo mismo al cambiar la cadencia: 2 cuotas cubren 2 meses en mensual y 2 semanas en semanal, y
   * la protección caía a una séptima parte sin que nadie lo hubiera decidido. 60 días equivalen a
   * las 2 cuotas de antes en una junta mensual, así que ningún círculo existente cambia.
   */
  @IsInt()
  @Min(0)
  @Max(366)
  PAYOUT_RETENTION_COVERAGE_DAYS: number = 60;

  /**
   * Tope de la retención como parte del pozo, en puntos básicos (COPAYNI-112). 10000 es sin tope
   * efectivo, que es el comportamiento actual: en una junta de 4 turnos, quien cobra primero ve
   * retenido el 50 % del pozo. Si eso se acota, lo decide riesgo y finanzas (COPAYNI-102).
   */
  @IsInt()
  @Min(0)
  @Max(10000)
  PAYOUT_RETENTION_MAX_POT_BPS: number = 10_000;

  /**
   * Antigüedad máxima de la autenticación del personal para una acción crítica, como pausar un
   * círculo (step-up, COPAYNI-61), en segundos.
   */
  @IsInt()
  @Min(60)
  @Max(3600)
  STAFF_STEP_UP_MAX_AGE_SECONDS: number = 300;

  /**
   * WhatsApp de soporte (COPAYNI-83) en formato internacional, solo dígitos (p. ej. 51999999999).
   * Sin valor, la app no ofrece el botón de WhatsApp.
   */
  @IsOptional()
  @Matches(/^[1-9]\d{7,14}$/, {
    message: 'SUPPORT_WHATSAPP_NUMBER: solo dígitos con código de país',
  })
  SUPPORT_WHATSAPP_NUMBER?: string;

  /**
   * Login social (COPAYNI-91). Client id de Google admitidos como audiencia, separados por coma:
   * Android, iOS y Web. Vacío apaga el login con Google en este ambiente.
   */
  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_IDS?: string;

  /**
   * Client ID del cliente **Web** de Google: el único tipo al que Google admite un `redirect_uri`
   * HTTPS propio, que es lo que exige el flujo que coordina el backend. Debe estar también en
   * `GOOGLE_CLIENT_IDS`, porque es la audiencia del ID Token que llega.
   */
  @IsOptional()
  @IsString()
  GOOGLE_WEB_CLIENT_ID?: string;

  /**
   * Client secret de ese cliente Web. **Es un secreto**: va en Secrets Manager, nunca en el
   * repositorio ni en una variable `EXPO_PUBLIC_`. Sin él, el inicio con Google se apaga.
   */
  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  /** Callback HTTPS registrado en Google Cloud Console para el cliente Web. */
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  GOOGLE_REDIRECT_URI?: string;

  /**
   * Audiencias de Apple: el bundle id de iOS y el Services ID del flujo web de Android. Vacío
   * apaga el login con Apple.
   */
  @IsOptional()
  @IsString()
  APPLE_CLIENT_IDS?: string;

  /** Services ID del flujo web de Apple en Android. */
  @IsOptional()
  @IsString()
  APPLE_SERVICE_ID?: string;

  @IsOptional()
  @IsString()
  APPLE_TEAM_ID?: string;

  @IsOptional()
  @IsString()
  APPLE_KEY_ID?: string;

  /**
   * Clave `.p8` de Sign in with Apple, en PEM. **Es un secreto**: va en Secrets Manager, nunca en
   * el repositorio ni en una variable `EXPO_PUBLIC_`. Sin ella, el flujo web de Android se apaga.
   */
  @IsOptional()
  @IsString()
  APPLE_PRIVATE_KEY?: string;

  /** Callback HTTPS registrado en Apple para el flujo web. */
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  APPLE_REDIRECT_URI?: string;

  /** Deep link por el que la app recibe el código interno de un solo uso. */
  @IsString()
  @IsNotEmpty()
  SOCIAL_APP_REDIRECT_URI: string = 'ayni://auth/social';

  /** Cuánto vive un intento del flujo web de Apple. */
  @IsInt()
  @Min(60)
  @Max(1800)
  SOCIAL_FLOW_TTL_SECONDS: number = 600;

  @IsInt()
  @Min(1000)
  @Max(30_000)
  SOCIAL_TIMEOUT_MS: number = 10_000;

  /** Días antes del vencimiento de una cuota en que se notifica, además del mismo día (COPAYNI-84). */
  @IsInt()
  @Min(1)
  @Max(15)
  NOTIFICATION_DUE_SOON_DAYS: number = 3;

  /**
   * Antelación del recordatorio por cadencia, como `cadencia:dias` separadas por comas
   * (COPAYNI-120). Sin entrada para una cadencia rige `NOTIFICATION_DUE_SOON_DAYS`, calibrado
   * para un ciclo de 30 días; con 0 no se manda recordatorio previo, solo el del vencimiento.
   * La antelación tiene que ser menor que el ciclo, o el aviso llega antes del turno anterior.
   */
  @Transform(toList)
  @IsString({ each: true })
  @Matches(/^[a-z]+:\d{1,2}$/, { each: true })
  NOTIFICATION_DUE_SOON_DAYS_BY_CADENCE: string[] = [];

  /**
   * Aviso en el celular (COPAYNI-85). `fake` solo registra el envío, para desarrollo y pruebas, y
   * está prohibido en production; `expo` envía por Expo Push Service (T7).
   */
  @IsIn(PUSH_PROVIDERS)
  PUSH_PROVIDER: (typeof PUSH_PROVIDERS)[number] = 'fake';

  /** API de Expo Push Service. */
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['https', 'http'] })
  EXPO_PUSH_API_URL: string = 'https://exp.host/--/api/v2/push/send';

  /**
   * Token de acceso de Expo. Solo es obligatorio si el proyecto activa la seguridad reforzada de
   * notificaciones. Es un secreto: nunca se registra.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  EXPO_ACCESS_TOKEN?: string;

  @IsInt()
  @Min(1000)
  @Max(30_000)
  PUSH_TIMEOUT_MS: number = 10_000;

  /**
   * Horas tras las que un aviso ya no se envía: interrumpir con algo de ayer molesta más de lo que
   * ayuda. La notificación se queda en la bandeja igual.
   */
  @IsInt()
  @Min(1)
  @Max(72)
  PUSH_MAX_AGE_HOURS: number = 12;

  /** Notificaciones por corrida de la tarea; cada una puede ir a varios dispositivos. */
  @IsInt()
  @Min(1)
  @Max(1000)
  PUSH_BATCH_SIZE: number = 200;

  /**
   * Tandas como máximo en una corrida: el tope de avisos por corrida es este número por
   * `PUSH_BATCH_SIZE`. La corrida se detiene antes si vacía la cola.
   */
  @IsInt()
  @Min(1)
  @Max(1000)
  PUSH_MAX_BATCHES: number = 50;

  /** Intentos antes de abandonar un aviso, para que uno roto no bloquee la cola. */
  @IsInt()
  @Min(1)
  @Max(10)
  PUSH_MAX_ATTEMPTS: number = 3;

  /** Horas que vive una propuesta de doble aprobación sin decidir (COPAYNI-73, BO6). */
  @IsInt()
  @Min(1)
  @Max(720)
  STAFF_APPROVAL_TTL_HOURS: number = 72;

  /**
   * Identidad del personal: `unconfigured` rechaza toda la API de administración; `oidc` valida
   * los tokens de un proveedor OIDC con MFA (recomendado: Cognito); `dev` emite tokens locales con
   * `POST /admin/v1/dev/sessions` y está prohibido en production.
   */
  @IsIn(STAFF_AUTH_PROVIDERS)
  STAFF_AUTH_PROVIDER: (typeof STAFF_AUTH_PROVIDERS)[number] = 'unconfigured';

  /** Emisor del proveedor, p. ej. `https://cognito-idp.us-east-1.amazonaws.com/<pool>`. */
  @ValidateIf((env: EnvironmentVariables) => env.STAFF_AUTH_PROVIDER === 'oidc')
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  STAFF_OIDC_ISSUER?: string;

  /** `aud` del token o, si no lo trae (access token de Cognito), su `client_id`. */
  @ValidateIf((env: EnvironmentVariables) => env.STAFF_AUTH_PROVIDER === 'oidc')
  @IsString()
  @IsNotEmpty()
  STAFF_OIDC_AUDIENCE?: string;

  /** Claves públicas. Por defecto `<STAFF_OIDC_ISSUER>/.well-known/jwks.json`, la ruta de Cognito. */
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['https', 'http'] })
  STAFF_OIDC_JWKS_URL?: string;

  /** Claim con los roles del personal: en Cognito, sus grupos. */
  @IsString()
  @IsNotEmpty()
  STAFF_OIDC_ROLES_CLAIM: string = 'cognito:groups';

  /**
   * Mapa JSON de grupos del proveedor a roles de staff. Requerido cuando los grupos no se llaman
   * igual que los roles (p. ej. Identity Center: `{"ayni-prd-soporte":["support","operations"]}`).
   * Sin este campo, los valores del claim se tratan directamente como roles (compatible con Cognito).
   */
  @ValidateIf((env: EnvironmentVariables) => env.STAFF_AUTH_PROVIDER === 'oidc')
  @IsOptional()
  @IsString()
  STAFF_OIDC_GROUPS_MAP?: string;

  /**
   * Cobro de cuotas y pago de payouts del ciclo mensual. `fake` simula ambos (desarrollo y
   * pruebas) y está prohibido en production. `gateway` cobra con débito automático en la pasarela
   * (`PAYMENT_GATEWAY`); los payouts todavía no tienen riel (T5). Sin valor, el ciclo falla al
   * intentar cobrar.
   */
  @IsOptional()
  @IsIn(CYCLE_PAYMENTS_ADAPTERS)
  CIRCLE_PAYMENTS_ADAPTER?: CyclePaymentsAdapter;

  /**
   * Pasarela de pago (COPAYNI-34, decidido: Mercado Pago con tarjetas y Yape). `fake` simula la
   * pasarela (desarrollo y pruebas) y está prohibida en production; sin valor, las operaciones
   * con tarjetas fallan.
   */
  @IsOptional()
  @IsIn(PAYMENT_GATEWAYS)
  PAYMENT_GATEWAY?: (typeof PAYMENT_GATEWAYS)[number];

  /** Access token de Mercado Pago. Es un secreto: nunca se registra. */
  @ValidateIf((env: EnvironmentVariables) => env.PAYMENT_GATEWAY === 'mercadopago')
  @IsString()
  @IsNotEmpty()
  MERCADOPAGO_ACCESS_TOKEN?: string;

  /** Clave secreta de los webhooks de Mercado Pago (firma `x-signature`). Es un secreto. */
  @ValidateIf((env: EnvironmentVariables) => env.PAYMENT_GATEWAY === 'mercadopago')
  @IsString()
  @IsNotEmpty()
  MERCADOPAGO_WEBHOOK_SECRET?: string;

  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['https', 'http'] })
  MERCADOPAGO_API_URL: string = 'https://api.mercadopago.com';

  @IsInt()
  @Min(1000)
  @Max(30000)
  MERCADOPAGO_TIMEOUT_MS: number = 10000;

  /**
   * Beneficio de referidos en unidades menores de DEFAULT_CURRENCY (COPAYNI-51, R7 provisional:
   * el del Figma). Lo reciben el invitado y el invitador.
   */
  @IsInt()
  @Min(0)
  REFERRAL_REWARD_AMOUNT: number = 15000;

  /** Invitados por los que un invitador recibe beneficio (R7, provisional). */
  @IsInt()
  @Min(0)
  @Max(1000)
  REFERRAL_MAX_REWARDED_INVITES: number = 10;

  /** Base del enlace de invitación: el deep link de la app (`scheme` de app.json). */
  @IsString()
  @IsNotEmpty()
  REFERRAL_LINK_BASE_URL: string = 'ayni://invite';

  /**
   * Planes de ahorro (COPAYNI-32): `clave:monto` en unidades menores, separados por comas.
   * Provisional, del Figma (R6, R12, M6); los dos últimos se llamaban "Silver" (duplicado).
   */
  @Matches(/^[a-z][a-z0-9_]{0,31}:\d+(,[a-z][a-z0-9_]{0,31}:\d+)*$/)
  SAVING_PLANS: string =
    'lite:300000,bronze:600000,silver:1200000,gold:3000000,platinum:6000000,diamond:10000000';

  /** Cashback por duración (COPAYNI-33): `meses:bps`. Provisional: 5 %, 10 % y 20 % (R6). */
  @Matches(/^\d{1,3}:\d{1,5}(,\d{1,3}:\d{1,5})*$/)
  SAVING_CASHBACK_BPS: string = '6:500,12:1000,24:2000';

  /**
   * Verificación de documentos (spike COPAYNI-42): `simulated` responde `KYC_SIMULATED_RESULT`
   * (desarrollo y pruebas, prohibido en production); `manual` deja todo en revisión para
   * operaciones hasta elegir el proveedor.
   */
  @IsIn(KYC_PROVIDERS)
  KYC_PROVIDER: (typeof KYC_PROVIDERS)[number] = 'simulated';

  /** Resultado del proveedor simulado para el National ID y el comprobante de ingresos. */
  @IsIn(KYC_SIMULATED_RESULTS)
  KYC_SIMULATED_RESULT: (typeof KYC_SIMULATED_RESULTS)[number] = 'approved';

  /**
   * API de VerificaID (COPAYNI-42): `https://sandbox-api.verifica.id` o, en producción,
   * `https://api.verifica.id`.
   */
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['https', 'http'] })
  VERIFICAID_API_URL: string = 'https://sandbox-api.verifica.id';

  /** Token Bearer de VerificaID (prod-hub.verifica.id). Es un secreto: nunca se registra. */
  @ValidateIf((env: EnvironmentVariables) => env.KYC_PROVIDER === 'verificaid')
  @IsString()
  @IsNotEmpty()
  VERIFICAID_API_TOKEN?: string;

  /**
   * Token secreto de la URL del webhook de VerificaID (`/v1/webhooks/verificaid?token=`). Es un
   * secreto; VerificaID no documenta firma de webhooks.
   */
  @ValidateIf((env: EnvironmentVariables) => env.KYC_PROVIDER === 'verificaid')
  @IsString()
  @MinLength(32)
  VERIFICAID_WEBHOOK_TOKEN?: string;

  /** Adónde vuelve la persona al terminar el flujo biométrico (deep link de la app). */
  @IsString()
  @IsNotEmpty()
  VERIFICAID_CALLBACK_URL: string = 'ayni://identity-verification';

  @IsInt()
  @Min(1000)
  @Max(30000)
  VERIFICAID_TIMEOUT_MS: number = 10000;

  /** Versión del consentimiento del tratamiento de datos biométricos (L3, provisional). */
  @Matches(/^[\w.-]{1,32}$/)
  IDENTITY_CONSENT_VERSION: string = '2026-11';

  /** Rechazos atribuibles a la persona antes de pasar a revisión manual (kyc-peru.md). */
  @IsInt()
  @Min(1)
  @Max(10)
  IDENTITY_MAX_REJECTED_ATTEMPTS: number = 3;

  /** Horas tras las que una sesión biométrica sin resultado se da por vencida. */
  @IsInt()
  @Min(1)
  @Max(168)
  IDENTITY_SESSION_TTL_HOURS: number = 24;

  /**
   * Dónde se guardan los documentos KYC (COPAYNI-43): `s3` (floci en dev, AWS en prd) o
   * `simulated` (sin archivos; prohibido en production).
   */
  @IsIn(DOCUMENT_STORAGES)
  DOCUMENT_STORAGE: (typeof DOCUMENT_STORAGES)[number] = 'simulated';

  /** Bucket privado de documentos (infra/terraform/modules/documents-bucket). */
  @ValidateIf((env: EnvironmentVariables) => env.DOCUMENT_STORAGE === 's3')
  @Matches(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, {
    message: 'DOCUMENTS_BUCKET no es un bucket S3 válido',
  })
  DOCUMENTS_BUCKET?: string;

  /** Región de AWS de los servicios que usa la API. */
  @IsString()
  @IsNotEmpty()
  AWS_REGION: string = 'us-east-1';

  /**
   * Endpoint de S3 para el emulador (floci: `http://localhost:4566`). Sin valor, el de AWS.
   */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  DOCUMENTS_S3_ENDPOINT?: string;

  /**
   * Host público con el que se firman las URLs de subida (dev con ngrok: la URL del túnel). La
   * API sigue hablando con S3 por `DOCUMENTS_S3_ENDPOINT`. Sin valor, firma con ese mismo.
   */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  DOCUMENTS_S3_PUBLIC_ENDPOINT?: string;

  /** Vigencia de la URL prefirmada de subida de documentos (COPAYNI-43), en segundos. */
  @IsInt()
  @Min(60)
  @Max(900)
  DOCUMENT_UPLOAD_URL_TTL_SECONDS: number = 300;

  /**
   * Límite mensual de pay-in con el ingreso aprobado (R5, provisional): este porcentaje del
   * ingreso, en puntos básicos. Sin ingreso aprobado se usa `JOIN_MONTHLY_PAYIN_LIMIT`.
   */
  @IsInt()
  @Min(1)
  @Max(10000)
  PAYIN_LIMIT_INCOME_SHARE_BPS: number = 3000;

  /** Zona horaria del negocio: define en qué mes estamos para los cronogramas. */
  @IsTimeZone()
  BUSINESS_TIME_ZONE: string = 'America/Lima';

  /**
   * Precio de los slots (pending-scope R1 y R4, provisionales), en puntos básicos: 25 % de slots
   * Fastest con fee de hasta el 10 %, 25 % Highest con descuento de hasta el 5 % y Admin Fees del
   * 12 %. Los mismos valores que el adaptador falso de mobile.
   */
  @IsInt()
  @Min(0)
  @Max(10000)
  SLOT_FASTEST_SHARE_BPS: number = 2500;

  @IsInt()
  @Min(0)
  @Max(10000)
  SLOT_HIGHEST_SHARE_BPS: number = 2500;

  @IsInt()
  @Min(0)
  @Max(10000)
  SLOT_MAX_FEE_BPS: number = 1000;

  @IsInt()
  @Min(0)
  @Max(10000)
  SLOT_MAX_DISCOUNT_BPS: number = 500;

  @IsInt()
  @Min(0)
  @Max(10000)
  ADMIN_FEE_BPS: number = 1200;

  @IsIn(ADMIN_FEE_MODES)
  ADMIN_FEE_MODE: (typeof ADMIN_FEE_MODES)[number] = 'added_to_installments';

  /** Métodos de cobro que se muestran, en orden: cuenta bancaria y Yape/Plin (COPAYNI-95). */
  @Transform(toList)
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(PAYOUT_METHOD_TYPES, { each: true })
  PAYOUT_METHODS: (typeof PAYOUT_METHOD_TYPES)[number][] = ['bank_account', 'wallet'];

  /** Métodos que se muestran deshabilitados ("Not available"). */
  @Transform(toList)
  @ArrayUnique()
  @IsIn(PAYOUT_METHOD_TYPES, { each: true })
  PAYOUT_METHODS_UNAVAILABLE: (typeof PAYOUT_METHOD_TYPES)[number][] = [];

  /** Métodos con el badge "No Charge" (sin costo para la persona). */
  @Transform(toList)
  @ArrayUnique()
  @IsIn(PAYOUT_METHOD_TYPES, { each: true })
  PAYOUT_METHODS_NO_CHARGE: (typeof PAYOUT_METHOD_TYPES)[number][] = ['bank_account', 'wallet'];

  /**
   * National ID al unirse a un Game'ya (COPAYNI-31). Provisional hasta el KYC (COPAYNI-47):
   * `assume_verified` deja unirse a todos; `assume_unverified` los trata como no verificados, para
   * probar la redirección a Scan National ID.
   */
  @IsIn(JOIN_IDENTITY_CHECKS)
  JOIN_IDENTITY_CHECK: (typeof JOIN_IDENTITY_CHECKS)[number] = 'assume_verified';

  /**
   * Límite mensual de pay-in, en unidades menores de DEFAULT_CURRENCY (pending-scope R5,
   * provisional): ninguna cuota del slot elegido puede superarlo. 0 = sin límite.
   */
  @IsInt()
  @Min(0)
  JOIN_MONTHLY_PAYIN_LIMIT: number = 0;

  /** Días para responder a la propuesta de un círculo incompleto (COPAYNI-62, supuesto de R2). */
  @IsInt()
  @Min(1)
  CIRCLE_START_APPROVAL_DAYS: number = 7;

  /**
   * Versión vigente de los términos del círculo (COPAYNI-86). Al cambiar el texto se sube la
   * versión: la app la muestra y la unión exige aceptar la vigente.
   */
  @IsString()
  @Matches(/^[\w.-]{1,32}$/)
  CIRCLE_TERMS_VERSION: string = '2026-11';

  /** Fallos seguidos con el passcode antes de bloquearlo (COPAYNI-23, supuesto de D9). */
  @IsInt()
  @Min(1)
  PASSCODE_MAX_ATTEMPTS: number = 5;

  @IsInt()
  @Min(1)
  PASSCODE_LOCK_SECONDS: number = 900;

  /** PostgreSQL (ADR 2, docs/architecture.md). */
  @IsString()
  @IsNotEmpty()
  DB_HOST!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT: number = 5432;

  @IsString()
  @IsNotEmpty()
  DB_NAME!: string;

  @IsString()
  @IsNotEmpty()
  DB_USERNAME!: string;

  /** Es un secreto: llega del gestor de secretos y nunca se registra. */
  @IsString()
  @IsNotEmpty()
  DB_PASSWORD!: string;

  /** TLS verificando el certificado del servidor. RDS lo exige (`rds.force_ssl`). */
  @Transform(toBoolean)
  @IsBoolean()
  DB_SSL: boolean = false;

  /** CA en PEM para verificar el servidor (bundle de RDS). Sin valor, se usan las CA del sistema. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_SSL_CA?: string;

  /**
   * Ruta del bundle de CA dentro del contenedor, cuando el PEM no cabe cómodo en una variable de
   * entorno. La imagen trae el de Amazon RDS en `/app/certs/rds-ca.pem`, cuya raíz no está en el
   * almacén de Node: sin él, `DB_SSL=true` no puede verificar a RDS. Tiene prioridad `DB_SSL_CA`.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_SSL_CA_FILE?: string;

  /**
   * Usuario de aplicación con el que se conecta la API. Lo crea o actualiza el runner de
   * migraciones (`migrate.ts`), que es el único que usa la credencial maestra de RDS: la API
   * nunca recibe permisos de DDL. Sin valor, el runner no toca ningún rol.
   */
  @IsOptional()
  @Matches(/^[a-z_][a-z0-9_]{2,62}$/, {
    message: 'DB_APP_USERNAME debe ser un identificador PostgreSQL en minúsculas',
  })
  DB_APP_USERNAME?: string;

  /** Contraseña del usuario de aplicación. Es un secreto: llega del gestor de secretos. */
  @ValidateIf((env: EnvironmentVariables) => env.DB_APP_USERNAME !== undefined)
  @IsString()
  @MinLength(16)
  DB_APP_PASSWORD?: string;

  /** Conexiones máximas del pool por instancia de la API. */
  @IsInt()
  @Min(1)
  @Max(100)
  DB_POOL_MAX: number = 10;

  /**
   * Clave privada P-256 en PEM para firmar los access tokens (ES256). Es un secreto: en AWS llega
   * de Secrets Manager. Obligatoria en production; en desarrollo y pruebas, sin valor se genera una
   * efímera al arrancar (los tokens dejan de valer al reiniciar). Admite `\n` escapados.
   */
  @ValidateIf((env: EnvironmentVariables) => env.NODE_ENV === 'production' || !!env.JWT_PRIVATE_KEY)
  @IsString()
  @Matches(/-----BEGIN (EC )?PRIVATE KEY-----/, {
    message: 'JWT_PRIVATE_KEY debe ser una clave PEM',
  })
  JWT_PRIVATE_KEY?: string;

  /** `kid` de la cabecera del JWT: permite rotar la clave aceptando la anterior un tiempo. */
  @Matches(/^[A-Za-z0-9._-]{1,64}$/)
  JWT_KEY_ID: string = 'ayni-1';

  @IsString()
  @IsNotEmpty()
  JWT_ISSUER: string = 'ayni-api';

  @IsString()
  @IsNotEmpty()
  JWT_AUDIENCE: string = 'ayni-mobile';

  /** Vida del access token, en segundos (pendiente: duración de las sesiones, COPAYNI-21). */
  @IsInt()
  @Min(60)
  @Max(3600)
  ACCESS_TOKEN_TTL_SECONDS: number = 900;

  /** Vida del refresh token rotativo, en días. */
  @IsInt()
  @Min(1)
  @Max(365)
  REFRESH_TOKEN_TTL_DAYS: number = 30;

  /**
   * Secreto con el que se guarda el hash (HMAC) de cada OTP: sin él, un código de 4 dígitos se
   * revierte probando las 10.000 combinaciones. Obligatorio en production; en desarrollo, efímero.
   */
  @ValidateIf((env: EnvironmentVariables) => env.NODE_ENV === 'production' || !!env.OTP_PEPPER)
  @IsString()
  @MinLength(32)
  OTP_PEPPER?: string;

  /**
   * Clave AES-256 (32 bytes en base64) con la que se cifran los datos sensibles guardados, como el
   * CCI de la cuenta de cobro (COPAYNI-81). Es un secreto de Secrets Manager. Obligatoria en
   * production; en desarrollo y pruebas, sin valor se usa una clave fija de desarrollo.
   */
  @ValidateIf(
    (env: EnvironmentVariables) => env.NODE_ENV === 'production' || !!env.FIELD_ENCRYPTION_KEY,
  )
  @Matches(/^[A-Za-z0-9+/]{43}=$/, {
    message: 'FIELD_ENCRYPTION_KEY debe ser una clave de 32 bytes en base64',
  })
  FIELD_ENCRYPTION_KEY?: string;

  /** Política de OTP provisional (pending-scope R10), igual que el adaptador falso de mobile. */
  @IsInt()
  @Min(60)
  OTP_CODE_TTL_SECONDS: number = 300;

  @IsInt()
  @Min(1)
  OTP_RESEND_COOLDOWN_SECONDS: number = 30;

  @IsInt()
  @Min(1)
  @Max(10)
  OTP_MAX_ATTEMPTS: number = 5;

  @IsInt()
  @Min(0)
  @Max(10)
  OTP_MAX_RESENDS: number = 3;

  /** Inicios de sesión por identificador dentro de la ventana; los siguientes responden 429. */
  @IsInt()
  @Min(1)
  OTP_START_MAX_PER_WINDOW: number = 5;

  @IsInt()
  @Min(60)
  OTP_START_WINDOW_SECONDS: number = 900;

  /**
   * Solo desarrollo: todos los OTP valen este código y no se envían (aún no hay proveedor,
   * pending-scope T6). Prohibido en production. Sin valor, el envío responde 503.
   */
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'OTP_DEV_CODE debe tener 4 dígitos' })
  OTP_DEV_CODE?: string;

  /**
   * Envío real del OTP (pending-scope T6): `none` (sin proveedor: 503, salvo OTP_DEV_CODE) o
   * `aws` (email con SES y SMS con End User Messaging SMS). Con `aws`, cada canal se activa con
   * su variable; el que no tenga la suya sigue respondiendo 503.
   */
  @IsIn(OTP_DELIVERIES)
  OTP_DELIVERY: (typeof OTP_DELIVERIES)[number] = 'none';

  /** Remitente verificado en SES: `no-reply@dominio` o `Ayni <no-reply@dominio>`. */
  @IsOptional()
  @Matches(/^(?:[^<>@\r\n]+ <[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/, {
    message: 'OTP_EMAIL_FROM debe ser un email o "Nombre <email>"',
  })
  OTP_EMAIL_FROM?: string;

  /** Configuration set de SES (rebotes, quejas y métricas; infra/terraform/modules/otp-messaging). */
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { message: 'OTP_SES_CONFIGURATION_SET no es válido' })
  OTP_SES_CONFIGURATION_SET?: string;

  /** Endpoint de SES para el emulador (floci: `http://localhost:4566`). Sin valor, el de AWS. */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  OTP_SES_ENDPOINT?: string;

  /** Número, pool o sender ID de End User Messaging SMS (ID o ARN), ya registrado. */
  @IsOptional()
  @Matches(/^[A-Za-z0-9+:/_.-]{1,256}$/, { message: 'OTP_SMS_ORIGINATION_IDENTITY no es válido' })
  OTP_SMS_ORIGINATION_IDENTITY?: string;

  /** Configuration set de End User Messaging SMS (eventos de entrega). Opcional. */
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { message: 'OTP_SMS_CONFIGURATION_SET no es válido' })
  OTP_SMS_CONFIGURATION_SET?: string;
}

/** Si se exporta alguna señal de telemetría (y por tanto se necesita el endpoint OTLP). */
export function exportsTelemetry(
  env: Pick<EnvironmentVariables, 'ENABLE_TRACING' | 'ENABLE_METRICS' | 'ENABLE_LOGGING'>,
): boolean {
  return env.ENABLE_TRACING || env.ENABLE_METRICS || env.ENABLE_LOGGING;
}

/**
 * Valida y tipa las variables de entorno. El mensaje de error nombra cada variable
 * inválida y su regla, nunca su valor (puede ser un secreto).
 */
/** Separador de los mensajes de configuración inválida, uno por línea. */
const LINE_BREAK = '\n';

/**
 * Gracia y mora de cada cadencia habilitada (COPAYNI-111): la API no inicia sin ellas.
 *
 * Una cadencia habilitada sin parámetros propios no cae en los de la mensual en silencio, porque
 * están calibrados para un ciclo de 30 días: aplicarlos a uno de 7 multiplica por cuatro las
 * ocasiones de mora al año sin que nadie lo haya decidido. Y la gracia tiene que ser más corta que
 * el ciclo, o se solaparía con la cuota siguiente.
 */
function assertDelinquencyByCadence(env: EnvironmentVariables): void {
  const parse = (entries: readonly string[]): Map<string, number> =>
    new Map(
      entries.map((entry) => {
        const [id, value] = entry.split(':');
        return [id!, Number(value)];
      }),
    );
  const grace = parse(env.DELINQUENCY_GRACE_DAYS_BY_CADENCE);
  const fees = parse(env.LATE_FEE_BPS_BY_CADENCE);
  grace.set('monthly', env.DELINQUENCY_GRACE_DAYS);
  fees.set('monthly', env.LATE_FEE_BPS);

  const problems: string[] = [];
  for (const id of env.CIRCLE_CADENCES_ENABLED) {
    if (!grace.has(id)) {
      problems.push(`- DELINQUENCY_GRACE_DAYS_BY_CADENCE: falta ${id}, que está habilitada`);
    }
    if (!fees.has(id)) {
      problems.push(`- LATE_FEE_BPS_BY_CADENCE: falta ${id}, que está habilitada`);
    }
  }
  for (const [id, days] of grace) {
    const cycleDays = Cadence.parse(id).approximateTurnDays();
    if (days >= cycleDays) {
      problems.push(
        `- DELINQUENCY_GRACE_DAYS_BY_CADENCE: ${id} tiene ${days} días de gracia y su ciclo dura ${cycleDays}`,
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(['Configuración inválida:', ...problems].join(LINE_BREAK));
  }
}

/**
 * El rango de turnos, si está configurado (COPAYNI-125).
 *
 * Los dos extremos van juntos: con uno solo no se sabe si el otro es el de la lista, el mínimo
 * del dominio o ninguno, y adivinarlo cambiaría en silencio lo que se le ofrece a la gente.
 */
function assertTurnsRange(env: EnvironmentVariables): void {
  const { CIRCLE_TURNS_MIN: min, CIRCLE_TURNS_MAX: max } = env;
  const problems: string[] = [];
  if ((min === undefined) !== (max === undefined)) {
    problems.push('- CIRCLE_TURNS_MIN y CIRCLE_TURNS_MAX: o se configuran los dos, o ninguno');
  }
  if (min !== undefined && max !== undefined && max < min) {
    problems.push(`- CIRCLE_TURNS_MAX: ${max} es menor que el mínimo ${min}`);
  }
  if (problems.length > 0) {
    throw new Error(['Configuración inválida:', ...problems].join(LINE_BREAK));
  }
}

/**
 * Antelación del recordatorio de cuota por cadencia (COPAYNI-120).
 *
 * Tiene que ser menor que la duración del ciclo: con 3 días de antelación sobre un ciclo de 7, el
 * recordatorio de un turno llegaría antes de que venza el anterior, y la persona recibiría dos
 * avisos de cuotas distintas casi juntos.
 */
function assertDueSoonByCadence(env: EnvironmentVariables): void {
  const byCadence = dueSoonByCadenceFrom(env.NOTIFICATION_DUE_SOON_DAYS_BY_CADENCE);
  const problems: string[] = [];
  for (const id of env.CIRCLE_CADENCES_ENABLED) {
    const cadence = Cadence.parse(id);
    const days = byCadence[id] ?? env.NOTIFICATION_DUE_SOON_DAYS;
    const cycleDays = cadence.approximateTurnDays();
    if (days >= cycleDays) {
      problems.push(
        `- NOTIFICATION_DUE_SOON_DAYS_BY_CADENCE: ${id} avisa ${days} días antes y su ciclo dura ${cycleDays}`,
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(['Configuración inválida:', ...problems].join(LINE_BREAK));
  }
}

/** Monedas admitidas con su tipo de cambio (pending-scope M2): la API no inicia sin él. */
function assertCurrencies(env: EnvironmentVariables): void {
  try {
    currencySettingsFrom(env);
  } catch (error) {
    throw new Error(`Configuración inválida:\n- EXCHANGE_RATES: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    excludeExtraneousValues: false,
  });
  const errors = validateSync(env, { skipMissingProperties: false, forbidUnknownValues: true });
  if (env.NODE_ENV === 'production' && env.OTP_DEV_CODE !== undefined) {
    throw new Error('Configuración inválida:\n- OTP_DEV_CODE: no se admite en production');
  }
  // Con el código fijo, el envío real mandaría a personas reales un código que todos conocen.
  if (env.OTP_DELIVERY === 'aws' && env.OTP_DEV_CODE !== undefined) {
    throw new Error('Configuración inválida:\n- OTP_DEV_CODE: no se admite con OTP_DELIVERY=aws');
  }
  if (
    env.OTP_DELIVERY === 'aws' &&
    env.OTP_EMAIL_FROM === undefined &&
    env.OTP_SMS_ORIGINATION_IDENTITY === undefined
  ) {
    throw new Error(
      'Configuración inválida:\n- OTP_DELIVERY: aws requiere OTP_EMAIL_FROM, OTP_SMS_ORIGINATION_IDENTITY o ambos',
    );
  }
  if (errors.length === 0 && !env.CIRCLE_CADENCES_ENABLED.includes('monthly')) {
    // Quitarla dejaría sin poder crearse la cadencia de todos los círculos que existen.
    throw new Error(
      'Configuración inválida:\n- CIRCLE_CADENCES_ENABLED: monthly no se puede deshabilitar',
    );
  }
  // Ya se sabe que las cadencias son válidas: cada una habilitada necesita su gracia y su mora.
  if (errors.length === 0) assertDelinquencyByCadence(env);
  if (errors.length === 0) assertTurnsRange(env);
  if (errors.length === 0) assertDueSoonByCadence(env);
  if (env.NODE_ENV === 'production' && env.STAFF_AUTH_PROVIDER === 'dev') {
    throw new Error(
      'Configuración inválida:\n- STAFF_AUTH_PROVIDER: dev no se admite en production',
    );
  }
  if (env.NODE_ENV === 'production' && env.PUSH_PROVIDER === 'fake') {
    throw new Error('Configuración inválida:\n- PUSH_PROVIDER: fake no se admite en production');
  }
  if (env.NODE_ENV === 'production' && env.PAYMENT_GATEWAY === 'fake') {
    throw new Error('Configuración inválida:\n- PAYMENT_GATEWAY: fake no se admite en production');
  }
  if (env.NODE_ENV === 'production' && env.CIRCLE_PAYMENTS_ADAPTER === 'fake') {
    throw new Error(
      'Configuración inválida:\n- CIRCLE_PAYMENTS_ADAPTER: fake no se admite en production',
    );
  }
  if (env.NODE_ENV === 'production' && env.DOCUMENT_STORAGE === 'simulated') {
    throw new Error(
      'Configuración inválida:\n- DOCUMENT_STORAGE: simulated no se admite en production',
    );
  }
  if (env.NODE_ENV === 'production' && env.KYC_PROVIDER === 'simulated') {
    throw new Error(
      'Configuración inválida:\n- KYC_PROVIDER: simulated no se admite en production',
    );
  }
  if (
    env.NODE_ENV === 'production' &&
    env.JOIN_PAYOUT_MAX > PAYOUT_MAX_WITHOUT_BIOMETRIC_KYC &&
    env.KYC_PROVIDER !== 'verificaid'
  ) {
    throw new Error(
      `Configuración inválida:\n- JOIN_PAYOUT_MAX: por encima de ${PAYOUT_MAX_WITHOUT_BIOMETRIC_KYC} exige KYC_PROVIDER=verificaid (pending-scope §3.2, P4)`,
    );
  }
  if (errors.length === 0) assertCurrencies(env);
  if (errors.length > 0) {
    const problems = errors.map(
      ({ property, constraints }) =>
        `- ${property}: ${Object.values(constraints ?? {}).join('; ') || 'valor inválido'}`,
    );
    throw new Error(`Configuración inválida:\n${problems.join('\n')}`);
  }
  return env;
}

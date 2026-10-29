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

export const NODE_ENVS = ['development', 'test', 'production'] as const;
/** Igual que `CYCLE_PAYMENTS_ADAPTERS` del módulo de círculos (COPAYNI-56). */
export const CYCLE_PAYMENTS_ADAPTERS = ['fake'] as const;
export type CyclePaymentsAdapter = (typeof CYCLE_PAYMENTS_ADAPTERS)[number];
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
export const CIRCLE_ASSIGNMENT_STRATEGIES = ['fill_oldest', 'always_new'] as const;
/** Igual que `ADMIN_FEE_MODES` del dominio de círculos (pending-scope R4). */
export const ADMIN_FEE_MODES = ['added_to_installments', 'deducted_from_payout'] as const;
/** Igual que `PAYOUT_METHOD_TYPES` del dominio de payouts (Figma 55:9520). */
export const PAYOUT_METHOD_TYPES = [
  'digital_wallet',
  'prepaid_card',
  'bank_transfer',
  'fawry',
] as const;
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
   * puntos básicos (R18, propuesto: 25 %).
   */
  @IsInt()
  @Min(0)
  @Max(10000)
  GUARANTEE_FUND_FEE_SHARE_BPS: number = 2500;

  /** Saldo mínimo del fondo en cuotas base por círculo en curso; debajo, alerta (R18, propuesto). */
  @IsInt()
  @Min(0)
  @Max(12)
  GUARANTEE_FUND_MIN_INSTALLMENTS_PER_CIRCLE: number = 2;

  /** Círculos completados sin expulsión que pide un turno Fastest Payout (COPAYNI-60, R18). */
  @IsInt()
  @Min(0)
  @Max(12)
  TRUST_FASTEST_MIN_COMPLETED_CIRCLES: number = 1;

  /**
   * Cuotas base retenidas del payout de los turnos de la primera mitad, que pagan sus últimas
   * cuotas (COPAYNI-60, R18 propuesto). 0 desactiva la retención.
   */
  @IsInt()
  @Min(0)
  @Max(12)
  PAYOUT_RETENTION_INSTALLMENTS: number = 2;

  /**
   * Antigüedad máxima de la autenticación del personal para una acción crítica, como pausar un
   * círculo (step-up, COPAYNI-61), en segundos.
   */
  @IsInt()
  @Min(60)
  @Max(3600)
  STAFF_STEP_UP_MAX_AGE_SECONDS: number = 300;

  /**
   * Cobro de cuotas y pago de payouts del ciclo mensual. `fake` simula ambos (desarrollo y
   * pruebas) y está prohibido en production; sin valor, el ciclo falla al intentar cobrar
   * (pasarela pendiente: D1, COPAYNI-34).
   */
  @IsOptional()
  @IsIn(CYCLE_PAYMENTS_ADAPTERS)
  CIRCLE_PAYMENTS_ADAPTER?: CyclePaymentsAdapter;

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

  /**
   * Métodos de cobro que se muestran, en orden (Payout Method, 55:9520). Provisional hasta definir
   * los proveedores locales (pending-scope T5): Fawry es egipcio y queda fuera por defecto.
   */
  @Transform(toList)
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(PAYOUT_METHOD_TYPES, { each: true })
  PAYOUT_METHODS: (typeof PAYOUT_METHOD_TYPES)[number][] = [
    'digital_wallet',
    'prepaid_card',
    'bank_transfer',
  ];

  /** Métodos que se muestran deshabilitados ("Not available"). */
  @Transform(toList)
  @ArrayUnique()
  @IsIn(PAYOUT_METHOD_TYPES, { each: true })
  PAYOUT_METHODS_UNAVAILABLE: (typeof PAYOUT_METHOD_TYPES)[number][] = [];

  /** Métodos con el badge "No Charge" (en el Figma, la tarjeta prepago y la transferencia). */
  @Transform(toList)
  @ArrayUnique()
  @IsIn(PAYOUT_METHOD_TYPES, { each: true })
  PAYOUT_METHODS_NO_CHARGE: (typeof PAYOUT_METHOD_TYPES)[number][] = [
    'prepaid_card',
    'bank_transfer',
  ];

  /** Límite de la tarjeta prepago, en unidades menores de DEFAULT_CURRENCY (Figma: 100.000). */
  @IsInt()
  @Min(1)
  PAYOUT_PREPAID_CARD_LIMIT: number = 10_000_000;

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
export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    excludeExtraneousValues: false,
  });
  const errors = validateSync(env, { skipMissingProperties: false, forbidUnknownValues: true });
  if (env.NODE_ENV === 'production' && env.OTP_DEV_CODE !== undefined) {
    throw new Error('Configuración inválida:\n- OTP_DEV_CODE: no se admite en production');
  }
  if (env.NODE_ENV === 'production' && env.CIRCLE_PAYMENTS_ADAPTER === 'fake') {
    throw new Error(
      'Configuración inválida:\n- CIRCLE_PAYMENTS_ADAPTER: fake no se admite en production',
    );
  }
  if (errors.length > 0) {
    const problems = errors.map(
      ({ property, constraints }) =>
        `- ${property}: ${Object.values(constraints ?? {}).join('; ') || 'valor inválido'}`,
    );
    throw new Error(`Configuración inválida:\n${problems.join('\n')}`);
  }
  return env;
}

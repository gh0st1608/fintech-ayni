import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;

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
  if (errors.length > 0) {
    const problems = errors.map(
      ({ property, constraints }) =>
        `- ${property}: ${Object.values(constraints ?? {}).join('; ') || 'valor inválido'}`,
    );
    throw new Error(`Configuración inválida:\n${problems.join('\n')}`);
  }
  return env;
}

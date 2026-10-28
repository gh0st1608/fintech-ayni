import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type Response } from 'express';

import {
  AppError,
  type ErrorDetails,
  type ErrorKind,
  RateLimitedError,
} from '../../errors/app-error';
import { type AppRequest, traceIdOf } from '../http/app-request';

export interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: ErrorDetails };
  traceId: string;
}

interface HttpError {
  status: number;
  code: string;
  message: string;
  details?: ErrorDetails;
}

const STATUS_BY_KIND: Record<ErrorKind, number> = {
  validation: HttpStatus.BAD_REQUEST,
  unauthorized: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  domain: HttpStatus.UNPROCESSABLE_ENTITY,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  infrastructure: HttpStatus.SERVICE_UNAVAILABLE,
};

const UNAVAILABLE_MESSAGE = 'Servicio no disponible temporalmente';

/** Errores HTTP del framework y de body-parser: código y mensaje propios, nunca el original. */
const FRAMEWORK_ERRORS: Partial<Record<number, Omit<HttpError, 'status'>>> = {
  [HttpStatus.BAD_REQUEST]: { code: 'BAD_REQUEST', message: 'Petición mal formada' },
  [HttpStatus.UNAUTHORIZED]: { code: 'UNAUTHORIZED', message: 'Autenticación requerida' },
  [HttpStatus.FORBIDDEN]: { code: 'FORBIDDEN', message: 'Acceso denegado' },
  [HttpStatus.NOT_FOUND]: { code: 'NOT_FOUND', message: 'No se encontró el recurso' },
  [HttpStatus.METHOD_NOT_ALLOWED]: { code: 'METHOD_NOT_ALLOWED', message: 'Método no permitido' },
  [HttpStatus.REQUEST_TIMEOUT]: {
    code: 'REQUEST_TIMEOUT',
    message: 'La petición tardó demasiado',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'El cuerpo de la petición es demasiado grande',
  },
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Tipo de contenido no admitido',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: 'RATE_LIMITED',
    message: 'Demasiadas solicitudes, intenta más tarde',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: { code: 'SERVICE_UNAVAILABLE', message: UNAVAILABLE_MESSAGE },
};

const INTERNAL_ERROR: HttpError = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  code: 'INTERNAL_ERROR',
  message: 'Ocurrió un error inesperado',
};

/** Errores de body-parser (JSON mal formado, cuerpo demasiado grande). */
function isClientHttpError(error: unknown): error is { status: number; expose: true } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'expose' in error &&
    error.expose === true &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500
  );
}

function fromFrameworkStatus(status: number): HttpError {
  const known = FRAMEWORK_ERRORS[status];
  if (known) return { status, ...known };
  return status >= 500
    ? INTERNAL_ERROR
    : { status, code: 'HTTP_ERROR', message: 'Petición rechazada' };
}

/**
 * Traduce cualquier excepción al contrato `{ success: false, error, traceId }`.
 * Nunca expone stack traces ni mensajes internos; los errores 5xx se registran con su causa.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AppRequest>();
    const response = http.getResponse<Response>();
    const traceId = traceIdOf(request);

    const error = this.toHttpError(exception);
    // Un 503 de framework se lanza a propósito (readiness) y ya se registró con su motivo.
    if (error.status >= 500 && !(exception instanceof ServiceUnavailableException)) {
      this.logger.error(
        { traceId, method: request.method, path: request.path, status: error.status },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
      },
      traceId,
    };
    if (exception instanceof RateLimitedError) {
      response.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil(exception.retryAfterSeconds))),
      );
    }
    response.status(error.status).json(body);
  }

  private toHttpError(exception: unknown): HttpError {
    if (exception instanceof AppError) {
      const status = STATUS_BY_KIND[exception.kind];
      return {
        status,
        code: exception.code,
        message: status >= 500 ? UNAVAILABLE_MESSAGE : exception.message,
        details: status >= 500 ? undefined : exception.details,
      };
    }
    if (exception instanceof HttpException) return fromFrameworkStatus(exception.getStatus());
    if (isClientHttpError(exception)) return fromFrameworkStatus(exception.status);
    return INTERNAL_ERROR;
  }
}

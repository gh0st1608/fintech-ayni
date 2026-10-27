import {
  type ArgumentsHost,
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

import {
  ConflictError,
  DomainError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@src/shared/errors/app-error';
import { AllExceptionsFilter } from '@src/shared/presentation/filters/all-exceptions.filter';
import { type AppRequest } from '@src/shared/presentation/http/app-request';

function catchWith(exception: unknown, request: Partial<AppRequest> = { traceId: 'trace-1' }) {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', path: '/v1/x', ...request }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  const [[status]] = response.status.mock.calls as [[number]];
  const [[body]] = response.json.mock.calls as [[Record<string, unknown>]];
  return { status, body };
}

describe('AllExceptionsFilter', () => {
  let logError: jest.SpyInstance;
  beforeEach(() => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => logError.mockRestore());

  it.each([
    [new ValidationError('Datos inválidos', { email: 'inválido' }), 400, 'VALIDATION_ERROR'],
    [new UnauthorizedError(), 401, 'UNAUTHORIZED'],
    [new ForbiddenError(), 403, 'FORBIDDEN'],
    [new NotFoundError(), 404, 'NOT_FOUND'],
    [new ConflictError('ALREADY_JOINED', 'Ya eres miembro'), 409, 'ALREADY_JOINED'],
    [
      new DomainError('OTP_INVALID', 'Código incorrecto', { attemptsRemaining: '2' }),
      422,
      'OTP_INVALID',
    ],
  ])('traduce %p al contrato de error', (error, status, code) => {
    const result = catchWith(error);

    expect(result.status).toBe(status);
    expect(result.body).toEqual({
      success: false,
      error: {
        code,
        message: error.message,
        ...(error.details && { details: error.details }),
      },
      traceId: 'trace-1',
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('un error de infraestructura responde 503 genérico y registra la causa', () => {
    const cause = new Error('connection refused 10.0.0.5:5432');
    const result = catchWith(new InfrastructureError('Falló la base de datos', cause));

    expect(result.status).toBe(503);
    expect(result.body.error).toEqual({
      code: 'INFRASTRUCTURE_ERROR',
      message: 'Servicio no disponible temporalmente',
    });
    expect(JSON.stringify(result.body)).not.toContain('10.0.0.5');
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: 'trace-1', status: 503 }),
      expect.any(String),
    );
  });

  it('un error inesperado responde 500 sin stack ni mensaje interno', () => {
    const result = catchWith(new TypeError('Cannot read properties of undefined (secret)'));

    expect(result.status).toBe(500);
    expect(result.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado',
    });
    expect(JSON.stringify(result.body)).not.toMatch(/secret|stack|TypeError/);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('registra valores no Error como texto', () => {
    expect(catchWith('boom').status).toBe(500);
    expect(logError).toHaveBeenCalledWith(expect.anything(), 'boom');
  });

  it.each([
    [new BadRequestException('detalle interno'), 400, 'BAD_REQUEST'],
    [new NotFoundException('Cannot GET /v1/x'), 404, 'NOT_FOUND'],
    [new RequestTimeoutException(), 408, 'REQUEST_TIMEOUT'],
    [new ThrottlerException(), 429, 'RATE_LIMITED'],
    [new HttpException('teapot', 418), 418, 'HTTP_ERROR'],
    [new HttpException('bad gateway', 502), 500, 'INTERNAL_ERROR'],
  ])('traduce la excepción HTTP %p sin su mensaje original', (error, status, code) => {
    const result = catchWith(error);

    expect(result.status).toBe(status);
    expect(result.body.error).toMatchObject({ code });
    expect(JSON.stringify(result.body)).not.toMatch(/detalle interno|Cannot GET|teapot/);
  });

  it('un 503 lanzado a propósito (readiness) responde genérico y no se registra de nuevo', () => {
    const result = catchWith(new ServiceUnavailableException('database caída'));

    expect(result.status).toBe(503);
    expect(result.body.error).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Servicio no disponible temporalmente',
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('una excepción HTTP 5xx distinta de 503 sí se registra', () => {
    catchWith(new HttpException('bad gateway', 502));
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ status: 400, expose: true, type: 'entity.parse.failed' }, 400, 'BAD_REQUEST'],
    [{ status: 413, expose: true, type: 'entity.too.large' }, 413, 'PAYLOAD_TOO_LARGE'],
    [{ status: 415, expose: true }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ])('traduce errores de body-parser %p', (error, status, code) => {
    const result = catchWith(error);
    expect(result.status).toBe(status);
    expect(result.body.error).toMatchObject({ code });
  });

  it.each([
    [{ status: 500, expose: true }],
    [{ status: 400, expose: false }],
    [{ status: '400', expose: true }],
    [null],
  ])('no confía en objetos que no son errores de cliente: %p', (error) => {
    expect(catchWith(error).status).toBe(500);
  });

  it('genera un traceId si la petición no lo tiene', () => {
    const result = catchWith(new NotFoundError(), {});
    expect(result.body.traceId).toMatch(/^[0-9a-f]{32}$/);
  });
});

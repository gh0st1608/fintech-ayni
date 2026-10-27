import { EventEmitter } from 'node:events';

import {
  type CallHandler,
  type ExecutionContext,
  Logger,
  RequestTimeoutException,
} from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { IsEmail, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { firstValueFrom, NEVER, of, throwError } from 'rxjs';

import { type AppConfigService } from '@src/config/configuration';
import { ValidationError } from '@src/shared/errors/app-error';
import { startTelemetry } from '@src/shared/infrastructure/observability/telemetry';
import {
  accessLogMiddleware,
  type AppRequest,
  TRACE_ID_HEADER,
  traceIdMiddleware,
} from '@src/shared/presentation/http/app-request';
import { ResponseEnvelopeInterceptor } from '@src/shared/presentation/interceptors/response-envelope.interceptor';
import { TimeoutInterceptor } from '@src/shared/presentation/interceptors/timeout.interceptor';
import { createValidationPipe } from '@src/shared/presentation/pipes/validation.pipe';

const handler = (value: unknown): CallHandler => ({ handle: () => value as never });

describe('ResponseEnvelopeInterceptor', () => {
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ traceId: 'trace-1' }) }),
  } as unknown as ExecutionContext;

  it('envuelve el resultado con success y traceId', async () => {
    const result = new ResponseEnvelopeInterceptor().intercept(context, handler(of({ id: 1 })));
    await expect(firstValueFrom(result)).resolves.toEqual({
      success: true,
      data: { id: 1 },
      traceId: 'trace-1',
    });
  });

  it('deja sin cuerpo las respuestas vacías', async () => {
    const result = new ResponseEnvelopeInterceptor().intercept(context, handler(of(undefined)));
    await expect(firstValueFrom(result)).resolves.toBeUndefined();
  });
});

describe('TimeoutInterceptor', () => {
  const config = { get: () => 20 } as unknown as AppConfigService;

  it('corta con 408 cuando la petición supera el tiempo máximo', async () => {
    const result = new TimeoutInterceptor(config).intercept(undefined, handler(NEVER));
    await expect(firstValueFrom(result)).rejects.toBeInstanceOf(RequestTimeoutException);
  });

  it('deja pasar las respuestas a tiempo y los demás errores', async () => {
    const interceptor = new TimeoutInterceptor(config);
    await expect(firstValueFrom(interceptor.intercept(undefined, handler(of('ok'))))).resolves.toBe(
      'ok',
    );
    const failure = new Error('otro error');
    await expect(
      firstValueFrom(interceptor.intercept(undefined, handler(throwError(() => failure)))),
    ).rejects.toBe(failure);
  });
});

describe('traceIdMiddleware', () => {
  it('usa el trace id de OpenTelemetry si hay un span activo', () => {
    const telemetry = startTelemetry({
      APP_NAME: 'ayni-api',
      APP_VERSION: '0.1.0',
      DEPLOYMENT_ENVIRONMENT: 'test',
      LOG_LEVEL: 'fatal',
      ENABLE_TRACING: false,
      ENABLE_METRICS: false,
      ENABLE_LOGGING: false,
    });
    const request = { headers: {} } as unknown as AppRequest;

    const traceId = trace.getTracer('test').startActiveSpan('peticion', (span) => {
      traceIdMiddleware(request, { setHeader: jest.fn() } as never, jest.fn());
      span.end();
      return span.spanContext().traceId;
    });

    expect(request.traceId).toBe(traceId);
    return telemetry.shutdown();
  });

  it('asigna un traceId nuevo e ignora el enviado por el cliente', () => {
    const request = { traceId: 'del-cliente', headers: {} } as unknown as AppRequest;
    const response = { setHeader: jest.fn() };
    const next = jest.fn();

    traceIdMiddleware(request, response as never, next);

    expect(request.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(response.setHeader).toHaveBeenCalledWith(TRACE_ID_HEADER, request.traceId);
    expect(next).toHaveBeenCalled();
  });
});

describe('accessLogMiddleware', () => {
  let log: jest.SpyInstance;
  let debug: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const finish = (path: string): void => {
    const request = { method: 'GET', path, traceId: 'a'.repeat(32) } as AppRequest;
    const response = Object.assign(new EventEmitter(), { statusCode: 200 });
    const next = jest.fn();
    accessLogMiddleware(request, response as never, next);
    expect(next).toHaveBeenCalled();
    response.emit('finish');
  };

  it('registra método, ruta sin query, estado, duración y traceId al terminar', () => {
    finish('/v1/circles/join-config');

    expect(log).toHaveBeenCalledWith({
      message: 'GET /v1/circles/join-config 200',
      method: 'GET',
      path: '/v1/circles/join-config',
      statusCode: 200,
      durationMs: expect.any(Number),
      traceId: 'a'.repeat(32),
    });
  });

  it('registra los health checks solo en debug', () => {
    finish('/health/live');

    expect(log).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(expect.objectContaining({ path: '/health/live' }));
  });
});

class AddressDto {
  @IsString()
  city!: string;
}

class SignUpDto {
  @IsEmail()
  email!: string;

  @IsInt()
  @Min(18)
  age!: number;

  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;
}

describe('createValidationPipe', () => {
  const pipe = createValidationPipe();
  const validate = (value: unknown) =>
    pipe.transform(value, { type: 'body', metatype: SignUpDto }) as Promise<unknown>;

  it('transforma un cuerpo válido a la clase del DTO', async () => {
    const dto = await validate({ email: 'ana@mail.com', age: 30, address: { city: 'Lima' } });
    expect(dto).toBeInstanceOf(SignUpDto);
  });

  it('responde VALIDATION_ERROR con un mensaje por campo, incluidos los anidados', async () => {
    const error = (await validate({ email: 'no', age: 10, address: { city: 1 } }).catch(
      (caught: unknown) => caught,
    )) as ValidationError;

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual({
      email: expect.stringContaining('email'),
      age: expect.stringContaining('less than 18'),
      'address.city': expect.stringContaining('string'),
    });
  });

  it('rechaza campos no declarados en el DTO', async () => {
    const error = await validate({
      email: 'ana@mail.com',
      age: 30,
      address: { city: 'Lima' },
      isAdmin: true,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toHaveProperty('isAdmin');
  });
});

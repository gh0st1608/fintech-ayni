import { Body, Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { IsEmail, IsIn } from 'class-validator';
import request from 'supertest';

import { DomainError } from '@src/shared/errors/app-error';
import { Public } from '@src/shared/presentation/decorators/public.decorator';
import { createTestApp } from '@test/support/create-test-app';

class StartAuthDto {
  @IsEmail()
  identifier!: string;

  @IsIn(['email', 'phone'])
  type!: string;
}

/** Rutas de prueba montadas sobre la configuración global real (pipe, filter, guards). */
@Public()
@Controller({ path: 'probe', version: '1' })
class ProbeController {
  @Post('echo')
  @HttpCode(200)
  echo(@Body() body: StartAuthDto): StartAuthDto {
    return body;
  }

  @Post('empty')
  @HttpCode(204)
  empty(): void {}

  @Get('rule')
  rule(): never {
    throw new DomainError('OTP_INVALID', 'Código incorrecto', { attemptsRemaining: '2' });
  }

  @Get('crash')
  crash(): never {
    throw new Error('stack interno con datos sensibles');
  }

  @Get('slow')
  async slow(): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 5500));
    return 'tarde';
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('plataforma HTTP', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApp({ extraModules: [ProbeModule] });
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('validación de entradas', () => {
    it('acepta un DTO válido', async () => {
      const response = await http()
        .post('/v1/probe/echo')
        .send({ identifier: 'ana@mail.com', type: 'email' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { identifier: 'ana@mail.com', type: 'email' },
        traceId: expect.any(String),
      });
    });

    it('rechaza un DTO inválido con el detalle por campo', async () => {
      const response = await http()
        .post('/v1/probe/echo')
        .send({ identifier: 'no-es-email', type: 'fax', extra: true })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Los datos enviados no son válidos',
          details: {
            identifier: expect.any(String),
            type: expect.any(String),
            extra: expect.any(String),
          },
        },
        traceId: response.headers['x-trace-id'],
      });
    });

    it('rechaza JSON mal formado', async () => {
      const response = await http()
        .post('/v1/probe/echo')
        .set('Content-Type', 'application/json')
        .send('{"identifier":')
        .expect(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('rechaza un cuerpo mayor que BODY_LIMIT', async () => {
      const response = await http()
        .post('/v1/probe/echo')
        .send({ identifier: 'a'.repeat(2048), type: 'email' })
        .expect(413);
      expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('errores', () => {
    it('una regla de negocio responde 422 con su código', async () => {
      const response = await http().get('/v1/probe/rule').expect(422);
      expect(response.body.error).toEqual({
        code: 'OTP_INVALID',
        message: 'Código incorrecto',
        details: { attemptsRemaining: '2' },
      });
    });

    it('un error inesperado responde 500 genérico', async () => {
      const response = await http().get('/v1/probe/crash').expect(500);
      expect(response.body.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Ocurrió un error inesperado',
      });
      expect(response.text).not.toContain('sensibles');
    });

    it('una ruta inexistente responde 404 con el contrato', async () => {
      const response = await http().get('/v1/no-existe').expect(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    });

    it('una ruta sin versión no existe', async () => {
      await http().get('/circles/join-config').expect(404);
    });

    it('corta con 408 las peticiones que superan REQUEST_TIMEOUT', async () => {
      const response = await http().get('/v1/probe/slow').expect(408);
      expect(response.body.error.code).toBe('REQUEST_TIMEOUT');
    });
  });

  it('una respuesta 204 va sin cuerpo', async () => {
    const response = await http().post('/v1/probe/empty').expect(204);
    expect(response.text).toBe('');
  });

  describe('seguridad', () => {
    it('agrega cabeceras de Helmet y oculta el framework', async () => {
      const response = await http().get('/v1/probe/rule');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('permite CORS solo a los orígenes configurados', async () => {
      const allowed = await http().get('/v1/probe/rule').set('Origin', 'http://localhost:8081');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:8081');

      const other = await http().get('/v1/probe/rule').set('Origin', 'https://evil.example');
      expect(other.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('limita las solicitudes por cliente con RATE_LIMITED y Retry-After', async () => {
      for (let i = 0; i < 5; i += 1) await http().get('/v1/probe/rule').expect(422);

      const response = await http().get('/v1/probe/rule').expect(429);
      expect(response.body.error.code).toBe('RATE_LIMITED');
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  it('publica la documentación OpenAPI cuando ENABLE_SWAGGER está activo', async () => {
    const response = await http().get('/docs-json').expect(200);
    expect(response.body.paths).toHaveProperty('/v1/circles/join-config');
  });
});

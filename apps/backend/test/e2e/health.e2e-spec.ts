import { Logger } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@src/app.module';
import { APP_OPTIONS, configureApp } from '@src/app.setup';
import { READINESS_INDICATORS } from '@src/modules/health/application/ports/readiness-indicator.port';
import { TEST_ENV } from '@test/setup-env';
import { createTestApp } from '@test/support/create-test-app';

describe('health checks', () => {
  describe('con las dependencias disponibles', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(() => app.close());

    it.each(['/health/live', '/health/ready'])('%s responde 200 sin token', async (path) => {
      const response = await request(app.getHttpServer()).get(path).expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { status: 'ok' },
        traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      });
      expect(response.headers['x-trace-id']).toBe(response.body.traceId);
    });

    it('no tiene versión en la ruta', async () => {
      await request(app.getHttpServer()).get('/v1/health/live').expect(404);
    });

    it('no cuenta para el rate limit', async () => {
      const server = app.getHttpServer();
      for (let i = 0; i <= Number(TEST_ENV.RATE_LIMIT_MAX); i++) {
        await request(server).get('/health/live').expect(200);
      }
    });
  });

  describe('con una dependencia caída', () => {
    let app: NestExpressApplication;
    let warn: jest.SpyInstance;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(READINESS_INDICATORS)
        .useValue([{ name: 'database', isReady: () => Promise.resolve(false) }])
        .compile();
      app = configureApp(moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS));
      await app.init();
    });

    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => warn.mockRestore());

    afterAll(() => app.close());

    it('readiness responde 503 sin revelar qué dependencia falló', async () => {
      const response = await request(app.getHttpServer()).get('/health/ready').expect(503);

      expect(response.body).toEqual({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Servicio no disponible temporalmente' },
        traceId: expect.any(String),
      });
      expect(JSON.stringify(response.body)).not.toContain('database');
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ failing: ['database'] }));
    });

    it('liveness sigue respondiendo 200', async () => {
      await request(app.getHttpServer()).get('/health/live').expect(200);
    });
  });
});

import './support/high-rate-limit';
import { OTP_EMAIL_FROM } from './support/floci-otp';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp } from '@test/support/create-test-app';

import { FLOCI_ENDPOINT } from '../setup-env';

/** Último email que floci recibió para el destino, o `undefined`. */
async function lastEmailTo(
  destination: string,
): Promise<{ Source: string; text: string } | undefined> {
  const response = await fetch(`${FLOCI_ENDPOINT}/_aws/ses`);
  const { messages } = (await response.json()) as {
    messages: {
      Source: string;
      Destination: { ToAddresses: string[] };
      Body: { text_part: string | null };
    }[];
  };
  const message = messages.filter((m) => m.Destination.ToAddresses.includes(destination)).at(-1);
  return message && { Source: message.Source, text: message.Body.text_part ?? '' };
}

/**
 * Envío real del OTP (pending-scope T6) con OTP_DELIVERY=aws: el código llega por email (SES de
 * floci) y solo con ese código se inicia sesión. El SMS no tiene identidad de origen configurada.
 */
describe('Envío del OTP por email (floci)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
  });
  afterAll(() => app.close());

  it('el código llega por email y abre la sesión; el código fijo de desarrollo no sirve', async () => {
    const identifier = `otp-${randomUUID().slice(0, 8)}@correo.pe`;
    const started = await http()
      .post('/v1/auth/start')
      .send({ identifier, type: 'email' })
      .expect(200);
    const { challengeId } = started.body.data as { challengeId: string };

    const email = await lastEmailTo(identifier);
    expect(email?.Source).toBe(OTP_EMAIL_FROM);
    const code = /\b(\d{4})\b/.exec(email?.text ?? '')?.[1];
    expect(code).toBeDefined();

    // El código es aleatorio: el fijo de desarrollo (o cualquier otro) no abre la sesión.
    const wrong = code === '1234' ? '4321' : '1234';
    await http().post('/v1/auth/verify').send({ challengeId, code: wrong }).expect(422);
    const verified = await http().post('/v1/auth/verify').send({ challengeId, code }).expect(200);
    expect(verified.body.data.accessToken).toEqual(expect.any(String));
  });

  it('sin identidad de SMS, pedir el código por teléfono responde 503', async () => {
    const response = await http()
      .post('/v1/auth/start')
      .send({ identifier: '+51987654321', type: 'phone' })
      .expect(503);
    expect(response.body.error.code).toBe('INFRASTRUCTURE_ERROR');
  });
});

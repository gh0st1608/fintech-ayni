import './support/high-rate-limit';
import { OTP_EMAIL_FROM } from './support/floci-otp';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp } from '@test/support/create-test-app';

import { FLOCI_ENDPOINT } from '../setup-env';

interface FlociEmail {
  Id: string;
  Source: string;
  Destination: { ToAddresses: string[] };
  Body: { text_part: string | null };
  Timestamp: string;
}

async function emailsTo(destination: string): Promise<FlociEmail[]> {
  const response = await fetch(`${FLOCI_ENDPOINT}/_aws/ses`);
  const { messages } = (await response.json()) as { messages: FlociEmail[] };
  return messages.filter((m) => m.Destination.ToAddresses.includes(destination));
}

/**
 * Email más reciente que floci recibió para el destino, por su fecha: floci no garantiza el orden
 * de la lista. Con `after`, espera a que llegue uno que no estaba (el de la última petición).
 */
async function lastEmailTo(
  destination: string,
  after: string[] = [],
): Promise<{ Source: string; text: string; id: string } | undefined> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const fresh = (await emailsTo(destination)).filter((m) => !after.includes(m.Id));
    const message = fresh.sort((a, b) => a.Timestamp.localeCompare(b.Timestamp)).at(-1);
    if (message)
      return { Source: message.Source, text: message.Body.text_part ?? '', id: message.Id };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return undefined;
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

  it('el email sale en el idioma de la app, salvo que la persona haya elegido otro', async () => {
    const identifier = `otp-${randomUUID().slice(0, 8)}@correo.pe`;
    const started = await http()
      .post('/v1/auth/start')
      .set('Accept-Language', 'en-US,en;q=0.9')
      .send({ identifier, type: 'email' })
      .expect(200);
    const english = await lastEmailTo(identifier);
    expect(english?.text).toContain('Your Ayni verification code is');

    const code = /\b(\d{4})\b/.exec(english?.text ?? '')?.[1];
    const session = await http()
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code })
      .expect(200);
    await http()
      .patch('/v1/me')
      .set('Authorization', `Bearer ${session.body.data.accessToken as string}`)
      .send({ preferredLanguage: 'es' })
      .expect(200);

    const before = (await emailsTo(identifier)).map((m) => m.Id);
    await http()
      .post('/v1/auth/start')
      .set('Accept-Language', 'en')
      .send({ identifier, type: 'email' })
      .expect(200);
    expect((await lastEmailTo(identifier, before))?.text).toContain(
      'Tu código de verificación de Ayni es',
    );
  });

  it('sin identidad de SMS, pedir el código por teléfono responde 503', async () => {
    const response = await http()
      .post('/v1/auth/start')
      .send({ identifier: '+51987654321', type: 'phone' })
      .expect(503);
    expect(response.body.error.code).toBe('INFRASTRUCTURE_ERROR');
  });
});

import { randomUUID } from 'node:crypto';

import { SESv2Client } from '@aws-sdk/client-sesv2';
import { Logger } from '@nestjs/common';

import { SesEmailOtpSender } from '@src/modules/auth/infrastructure/messaging/aws-otp-senders';
import { InfrastructureError } from '@src/shared/errors/app-error';

import { FLOCI_ENDPOINT } from '../../../setup-env';

interface FlociSesMessage {
  Id: string;
  Source: string;
  Destination: { ToAddresses: string[] };
  Subject: string;
  Body: { text_part: string | null; html_part: string | null };
}

/** floci guarda cada email enviado y los expone en `/_aws/ses`. */
async function sentTo(destination: string): Promise<FlociSesMessage[]> {
  const response = await fetch(`${FLOCI_ENDPOINT}/_aws/ses`);
  const { messages } = (await response.json()) as { messages: FlociSesMessage[] };
  return messages.filter((message) => message.Destination.ToAddresses.includes(destination));
}

/**
 * El envío del OTP por email (pending-scope T6) contra el SES de floci, el emulador de AWS del
 * ambiente dev (infra/local/compose.yaml; en CI, un service). Nunca llega a AWS.
 */
describe('SesEmailOtpSender con floci', () => {
  const client = new SESv2Client({ region: 'us-east-1', endpoint: FLOCI_ENDPOINT });
  const sender = new SesEmailOtpSender(
    { region: 'us-east-1', fromAddress: 'Ayni <no-reply@ayni-test.pe>', ttlSeconds: 300 },
    client,
  );

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => client.destroy());

  it('envía el código al destino, en texto y HTML, desde el remitente configurado', async () => {
    const destination = `otp-${randomUUID().slice(0, 8)}@correo.pe`;

    await sender.send({ channel: 'email', destination, code: '4821' });

    const [message, ...others] = await sentTo(destination);
    expect(others).toHaveLength(0);
    expect(message).toMatchObject({
      Source: 'Ayni <no-reply@ayni-test.pe>',
      Subject: 'Tu código de verificación de Ayni',
    });
    expect(message?.Body.text_part).toContain('4821');
    expect(message?.Body.html_part).toContain('>4821<');
  });

  it('si SES no responde, falla con 503', async () => {
    const offline = new SESv2Client({ region: 'us-east-1', endpoint: 'http://127.0.0.1:9' });
    const unreachable = new SesEmailOtpSender(
      { region: 'us-east-1', fromAddress: 'no-reply@ayni-test.pe', ttlSeconds: 300 },
      offline,
    );

    await expect(
      unreachable.send({ channel: 'email', destination: 'x@correo.pe', code: '1111' }),
    ).rejects.toBeInstanceOf(InfrastructureError);
    offline.destroy();
  });
});

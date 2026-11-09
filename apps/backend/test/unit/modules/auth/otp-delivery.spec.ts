import {
  ConflictException,
  type SendTextMessageCommand,
  type SendTextMessageCommandOutput,
} from '@aws-sdk/client-pinpoint-sms-voice-v2';
import {
  MessageRejected,
  type SendEmailCommand,
  type SendEmailCommandOutput,
} from '@aws-sdk/client-sesv2';
import { Logger } from '@nestjs/common';

import {
  DevOtpSender,
  UnavailableOtpSender,
} from '@src/modules/auth/infrastructure/crypto/otp.adapters';
import {
  ChannelOtpSender,
  providerFailure,
  SesEmailOtpSender,
  SmsOtpSender,
} from '@src/modules/auth/infrastructure/messaging/aws-otp-senders';
import { resolveOtpLanguage } from '@src/modules/auth/application/ports/auth.ports';
import {
  otpEmail,
  otpSmsText,
  otpTtlMinutes,
} from '@src/modules/auth/infrastructure/messaging/otp-messages';
import { selectOtpSender } from '@src/modules/auth/infrastructure/messaging/otp-sender.factory';
import { InfrastructureError } from '@src/shared/errors/app-error';

const CODE = '4821';
const EMAIL = 'ana@correo.pe';
const PHONE = '+51987654321';

/** Todo lo que el sender escribió en los logs, para comprobar que no filtra el código ni el destino. */
function captureLogs(): { text: () => string } {
  const calls: unknown[] = [];
  for (const method of ['log', 'warn', 'error'] as const) {
    jest.spyOn(Logger.prototype, method).mockImplementation((...args: unknown[]) => {
      calls.push(args);
    });
  }
  return { text: () => JSON.stringify(calls) };
}

afterEach(() => jest.restoreAllMocks());

describe('Textos del OTP', () => {
  it('redondea la vigencia a minutos, con un mínimo de 1', () => {
    expect(otpTtlMinutes(300)).toBe(5);
    expect(otpTtlMinutes(301)).toBe(6);
    expect(otpTtlMinutes(20)).toBe(1);
  });

  it('el SMS cabe en un segmento GSM-7: sin tildes y hasta 160 caracteres', () => {
    const text = otpSmsText({ code: CODE, ttlSeconds: 300, language: 'es' });
    expect(text).toContain(CODE);
    expect(text).toContain('5 min');
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text).toMatch(/^[\x20-\x7E]+$/);
  });

  it('en inglés, el SMS también cabe en un segmento y el email cambia de idioma', () => {
    const sms = otpSmsText({ code: CODE, ttlSeconds: 300, language: 'en' });
    expect(sms).toContain(`code is ${CODE}`);
    expect(sms.length).toBeLessThanOrEqual(160);
    expect(sms).toMatch(/^[ -~]+$/);
    const email = otpEmail({ code: CODE, ttlSeconds: 300, language: 'en' });
    expect(email.subject).toBe('Your Ayni verification code');
    expect(email.html).toContain('<html lang="en">');
    expect(email.text).toContain('5 minutes');
  });

  it('el email trae el código en texto y HTML, y no lo pone en el asunto', () => {
    const email = otpEmail({ code: CODE, ttlSeconds: 600, language: 'es' });
    expect(email.subject).not.toContain(CODE);
    expect(email.text).toContain(CODE);
    expect(email.text).toContain('10 minutos');
    expect(email.html).toContain(`>${CODE}<`);
  });
});

describe('providerFailure', () => {
  it('conserva el nombre y el motivo, nunca el mensaje', () => {
    const error = new ConflictException({
      message: `El número ${PHONE} se dio de baja`,
      $metadata: {},
      Reason: 'DESTINATION_PHONE_NUMBER_OPTED_OUT',
      ResourceType: 'opt-out-list',
      ResourceId: 'default',
    });
    expect(providerFailure(error)).toEqual({
      error: 'ConflictException',
      reason: 'DESTINATION_PHONE_NUMBER_OPTED_OUT',
    });
    expect(providerFailure(new TypeError('x'))).toEqual({ error: 'TypeError' });
    expect(providerFailure('texto')).toEqual({ error: 'Unknown' });
  });
});

describe('SesEmailOtpSender', () => {
  const options = {
    region: 'us-east-1',
    fromAddress: 'Ayni <no-reply@ayni.pe>',
    ttlSeconds: 300,
  };

  it('envía el email al destino con el remitente y el configuration set', async () => {
    const logs = captureLogs();
    const send = jest.fn<Promise<SendEmailCommandOutput>, [SendEmailCommand]>(() =>
      Promise.resolve({ MessageId: 'ses-1', $metadata: {} }),
    );
    const sender = new SesEmailOtpSender({ ...options, configurationSet: 'ayni-otp' }, { send });

    await sender.send({ channel: 'email', destination: EMAIL, code: CODE, language: 'es' });

    const input = send.mock.calls[0]?.[0].input;
    expect(input).toMatchObject({
      FromEmailAddress: 'Ayni <no-reply@ayni.pe>',
      Destination: { ToAddresses: [EMAIL] },
      ConfigurationSetName: 'ayni-otp',
    });
    expect(input?.Content?.Simple?.Body?.Text?.Data).toContain(CODE);
    expect(logs.text()).toContain('ses-1');
    expect(logs.text()).not.toContain(CODE);
    expect(logs.text()).not.toContain(EMAIL);
  });

  it('sin configuration set no lo manda', async () => {
    captureLogs();
    const send = jest.fn(() => Promise.resolve({ MessageId: 'ses-2', $metadata: {} }));
    await new SesEmailOtpSender(options, { send }).send({
      channel: 'email',
      destination: EMAIL,
      code: CODE,
      language: 'es',
    });
    expect(send.mock.calls[0]).toBeDefined();
    expect((send.mock.calls[0] as unknown as [SendEmailCommand])[0].input).not.toHaveProperty(
      'ConfigurationSetName',
    );
  });

  it('si SES rechaza, responde 503 sin filtrar el destino ni el código', async () => {
    const logs = captureLogs();
    const send = jest.fn(() =>
      Promise.reject(
        new MessageRejected({ message: `Email address is not verified: ${EMAIL}`, $metadata: {} }),
      ),
    );
    const failure = new SesEmailOtpSender(options, { send }).send({
      channel: 'email',
      destination: EMAIL,
      code: CODE,
      language: 'es',
    });

    await expect(failure).rejects.toBeInstanceOf(InfrastructureError);
    await expect(failure).rejects.toThrow('El envío del código por email falló (MessageRejected)');
    expect(logs.text()).toContain('auth.otp_send_failed');
    expect(logs.text()).not.toContain(EMAIL);
    expect(logs.text()).not.toContain(CODE);
  });

  it('sin cliente propio crea el del SDK con el endpoint del emulador', () => {
    expect(
      () => new SesEmailOtpSender({ ...options, endpoint: 'http://localhost:4566' }),
    ).not.toThrow();
  });
});

describe('SmsOtpSender', () => {
  const options = { region: 'us-east-1', originationIdentity: 'pool-abc', ttlSeconds: 300 };

  it('envía un SMS transaccional desde la identidad registrada', async () => {
    const logs = captureLogs();
    const send = jest.fn<Promise<SendTextMessageCommandOutput>, [SendTextMessageCommand]>(() =>
      Promise.resolve({ MessageId: 'sms-1', $metadata: {} }),
    );
    await new SmsOtpSender({ ...options, configurationSet: 'ayni-sms' }, { send }).send({
      channel: 'sms',
      destination: PHONE,
      code: CODE,
      language: 'es',
    });

    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      DestinationPhoneNumber: PHONE,
      OriginationIdentity: 'pool-abc',
      MessageType: 'TRANSACTIONAL',
      ConfigurationSetName: 'ayni-sms',
      MessageBody: otpSmsText({ code: CODE, ttlSeconds: 300, language: 'es' }),
    });
    expect(logs.text()).toContain('sms-1');
    expect(logs.text()).not.toContain(PHONE);
    expect(logs.text()).not.toContain(CODE);
  });

  it('si el número se dio de baja, responde 503 con el motivo en el log, sin el número', async () => {
    const logs = captureLogs();
    const send = jest.fn(() =>
      Promise.reject(
        new ConflictException({
          message: `Opted out: ${PHONE}`,
          $metadata: {},
          Reason: 'DESTINATION_PHONE_NUMBER_OPTED_OUT',
          ResourceType: 'opt-out-list',
          ResourceId: 'default',
        }),
      ),
    );
    const failure = new SmsOtpSender(options, { send }).send({
      channel: 'sms',
      destination: PHONE,
      code: CODE,
      language: 'es',
    });

    await expect(failure).rejects.toThrow('El envío del código por SMS falló (ConflictException)');
    expect(logs.text()).toContain('DESTINATION_PHONE_NUMBER_OPTED_OUT');
    expect(logs.text()).not.toContain(PHONE);
  });

  it('sin cliente propio crea el del SDK', () => {
    expect(() => new SmsOtpSender(options)).not.toThrow();
  });
});

describe('ChannelOtpSender', () => {
  it('manda cada canal a su proveedor', async () => {
    const email = { send: jest.fn(() => Promise.resolve()) };
    const sms = { send: jest.fn(() => Promise.resolve()) };
    const sender = new ChannelOtpSender({ email, sms });

    await sender.send({ channel: 'sms', destination: PHONE, code: CODE, language: 'es' });
    await sender.send({ channel: 'email', destination: EMAIL, code: CODE, language: 'es' });

    expect(sms.send).toHaveBeenCalledWith({
      channel: 'sms',
      destination: PHONE,
      code: CODE,
      language: 'es',
    });
    expect(email.send).toHaveBeenCalledWith({
      channel: 'email',
      destination: EMAIL,
      code: CODE,
      language: 'es',
    });
  });
});

describe('selectOtpSender', () => {
  const base = { region: 'us-east-1', codeTtlSeconds: 300 };

  it('con el código de desarrollo no envía nada', () => {
    const selection = selectOtpSender({ ...base, delivery: 'none', devCode: '1234' });
    expect(selection.sender).toBeInstanceOf(DevOtpSender);
    expect(selection.activeChannels).toEqual([]);
  });

  it('sin proveedor responde 503', async () => {
    const selection = selectOtpSender({ ...base, delivery: 'none' });
    expect(selection.sender).toBeInstanceOf(UnavailableOtpSender);
    await expect(
      selection.sender.send({ channel: 'email', destination: EMAIL, code: CODE, language: 'es' }),
    ).rejects.toBeInstanceOf(InfrastructureError);
  });

  it('con aws activa solo los canales configurados; el otro sigue en 503', async () => {
    const onlyEmail = selectOtpSender({
      ...base,
      delivery: 'aws',
      emailFrom: 'no-reply@ayni.pe',
      sesConfigurationSet: 'ayni-otp',
      sesEndpoint: 'http://localhost:4566',
    });
    expect(onlyEmail.activeChannels).toEqual(['email']);
    await expect(
      onlyEmail.sender.send({ channel: 'sms', destination: PHONE, code: CODE, language: 'es' }),
    ).rejects.toThrow('No hay proveedor de envío de OTP configurado');

    const both = selectOtpSender({
      ...base,
      delivery: 'aws',
      emailFrom: 'no-reply@ayni.pe',
      smsOriginationIdentity: 'pool-abc',
      smsConfigurationSet: 'ayni-sms',
    });
    expect(both.activeChannels).toEqual(['email', 'sms']);
    expect(both.sender).toBeInstanceOf(ChannelOtpSender);
  });
});

describe('resolveOtpLanguage', () => {
  it('usa la preferencia guardada, luego el idioma de la petición y, si no, español', () => {
    expect(resolveOtpLanguage('en', 'es')).toBe('en');
    expect(resolveOtpLanguage(null, 'en-US,en;q=0.9')).toBe('en');
    expect(resolveOtpLanguage('pt', 'EN_gb')).toBe('en');
    expect(resolveOtpLanguage(undefined, 'fr')).toBe('es');
    expect(resolveOtpLanguage()).toBe('es');
  });
});

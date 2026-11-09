import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
  type SendTextMessageCommandOutput,
} from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { SendEmailCommand, type SendEmailCommandOutput, SESv2Client } from '@aws-sdk/client-sesv2';
import { Logger } from '@nestjs/common';

import { InfrastructureError } from '../../../../shared/errors/app-error';
import { type OtpSenderPort } from '../../application/ports/auth.ports';
import { otpEmail, otpSmsText } from './otp-messages';

type OtpMessage = Parameters<OtpSenderPort['send']>[0];

/**
 * Tiempos de espera del SDK: la solicitud de OTP espera el envío, así que un proveedor lento no
 * debe dejarla colgada. Un solo reintento: cada intento repetido puede ser un SMS cobrado.
 */
const CLIENT_DEFAULTS = {
  maxAttempts: 2,
  requestHandler: { connectionTimeout: 3_000, requestTimeout: 5_000 },
};

/**
 * Nombre y motivo del error del proveedor, sin su mensaje: el de AWS puede incluir el número o el
 * email de destino, y estos datos terminan en los logs.
 */
export function providerFailure(error: unknown): { error: string; reason?: string } {
  if (!(error instanceof Error)) return { error: 'Unknown' };
  const reason = (error as { Reason?: unknown }).Reason;
  return typeof reason === 'string' ? { error: error.name, reason } : { error: error.name };
}

/** Cliente mínimo de SES v2: el SDK real o un doble en las pruebas. */
export interface SesEmailClient {
  send(command: SendEmailCommand): Promise<SendEmailCommandOutput>;
}

export interface SesEmailOtpSenderOptions {
  region: string;
  /** Remitente verificado en SES, p. ej. `Ayni <no-reply@dominio>`. */
  fromAddress: string;
  /** Configuration set de SES (rebotes, quejas y métricas). Opcional. */
  configurationSet?: string;
  /** Vigencia del código, para el texto del mensaje. */
  ttlSeconds: number;
  /** Endpoint propio (floci en dev y pruebas); sin valor, el de AWS. */
  endpoint?: string;
}

/**
 * Email con Amazon SES v2 (pending-scope T6). Las credenciales salen de la cadena por defecto del
 * SDK (el rol de la tarea en ECS). Nunca registra el código ni el destino.
 */
export class SesEmailOtpSender implements OtpSenderPort {
  private readonly logger = new Logger('Auth');
  private readonly client: SesEmailClient;

  constructor(
    private readonly options: SesEmailOtpSenderOptions,
    client?: SesEmailClient,
  ) {
    this.client =
      client ??
      new SESv2Client({
        region: options.region,
        ...CLIENT_DEFAULTS,
        ...(options.endpoint && { endpoint: options.endpoint }),
      });
  }

  async send({ destination, code }: OtpMessage): Promise<void> {
    const email = otpEmail({ code, ttlSeconds: this.options.ttlSeconds });
    try {
      const output = await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.options.fromAddress,
          Destination: { ToAddresses: [destination] },
          Content: {
            Simple: {
              Subject: { Data: email.subject, Charset: 'UTF-8' },
              Body: {
                Text: { Data: email.text, Charset: 'UTF-8' },
                Html: { Data: email.html, Charset: 'UTF-8' },
              },
            },
          },
          ...(this.options.configurationSet && {
            ConfigurationSetName: this.options.configurationSet,
          }),
        }),
      );
      this.logger.log({
        event: 'auth.otp_sent',
        channel: 'email',
        provider: 'ses',
        messageId: output.MessageId,
      });
    } catch (error) {
      const failure = providerFailure(error);
      this.logger.error({
        event: 'auth.otp_send_failed',
        channel: 'email',
        provider: 'ses',
        ...failure,
      });
      throw new InfrastructureError(`El envío del código por email falló (${failure.error})`);
    }
  }
}

/** Cliente mínimo de End User Messaging SMS: el SDK real o un doble en las pruebas. */
export interface SmsTextClient {
  send(command: SendTextMessageCommand): Promise<SendTextMessageCommandOutput>;
}

export interface SmsOtpSenderOptions {
  region: string;
  /** Número, pool o sender ID registrado en End User Messaging SMS (ID o ARN). */
  originationIdentity: string;
  /** Configuration set de End User Messaging SMS (eventos de entrega). Opcional. */
  configurationSet?: string;
  ttlSeconds: number;
}

/**
 * SMS con AWS End User Messaging SMS (pending-scope T6). Mensaje transaccional desde la identidad
 * de origen registrada. Nunca registra el código ni el número.
 */
export class SmsOtpSender implements OtpSenderPort {
  private readonly logger = new Logger('Auth');
  private readonly client: SmsTextClient;

  constructor(
    private readonly options: SmsOtpSenderOptions,
    client?: SmsTextClient,
  ) {
    this.client =
      client ?? new PinpointSMSVoiceV2Client({ region: options.region, ...CLIENT_DEFAULTS });
  }

  async send({ destination, code }: OtpMessage): Promise<void> {
    try {
      const output = await this.client.send(
        new SendTextMessageCommand({
          DestinationPhoneNumber: destination,
          OriginationIdentity: this.options.originationIdentity,
          MessageBody: otpSmsText({ code, ttlSeconds: this.options.ttlSeconds }),
          MessageType: 'TRANSACTIONAL',
          ...(this.options.configurationSet && {
            ConfigurationSetName: this.options.configurationSet,
          }),
        }),
      );
      this.logger.log({
        event: 'auth.otp_sent',
        channel: 'sms',
        provider: 'end-user-messaging',
        messageId: output.MessageId,
      });
    } catch (error) {
      const failure = providerFailure(error);
      this.logger.error({
        event: 'auth.otp_send_failed',
        channel: 'sms',
        provider: 'end-user-messaging',
        ...failure,
      });
      throw new InfrastructureError(`El envío del código por SMS falló (${failure.error})`);
    }
  }
}

/** Elige el proveedor según el canal del identificador: email por SES, teléfono por SMS. */
export class ChannelOtpSender implements OtpSenderPort {
  constructor(private readonly senders: { email: OtpSenderPort; sms: OtpSenderPort }) {}

  send(message: OtpMessage): Promise<void> {
    return this.senders[message.channel].send(message);
  }
}

import { type OtpSenderPort } from '../../application/ports/auth.ports';
import { DevOtpSender, UnavailableOtpSender } from '../crypto/otp.adapters';
import { ChannelOtpSender, SesEmailOtpSender, SmsOtpSender } from './aws-otp-senders';

/** Configuración validada del envío (config/env.validation.ts). */
export interface OtpDeliverySettings {
  delivery: 'none' | 'aws';
  devCode?: string;
  region: string;
  codeTtlSeconds: number;
  emailFrom?: string;
  sesConfigurationSet?: string;
  sesEndpoint?: string;
  smsOriginationIdentity?: string;
  smsConfigurationSet?: string;
}

export interface OtpSenderSelection {
  sender: OtpSenderPort;
  /** Canales que envían de verdad; el resto responde 503 (o nada, con el código de desarrollo). */
  activeChannels: ('email' | 'sms')[];
}

/**
 * Elige cómo se envía el OTP:
 * - `OTP_DEV_CODE`: no envía nada (solo desarrollo; la validación lo prohíbe con `aws`).
 * - `aws`: email por SES y SMS por End User Messaging SMS, cada uno si tiene su configuración.
 * - Sin proveedor: 503, nunca un código dado por enviado que no llega.
 */
export function selectOtpSender(settings: OtpDeliverySettings): OtpSenderSelection {
  if (settings.devCode) return { sender: new DevOtpSender(), activeChannels: [] };
  if (settings.delivery === 'none') {
    return { sender: new UnavailableOtpSender(), activeChannels: [] };
  }
  const unavailable = new UnavailableOtpSender();
  const ttlSeconds = settings.codeTtlSeconds;
  const email = settings.emailFrom
    ? new SesEmailOtpSender({
        region: settings.region,
        fromAddress: settings.emailFrom,
        ttlSeconds,
        ...(settings.sesConfigurationSet && { configurationSet: settings.sesConfigurationSet }),
        ...(settings.sesEndpoint && { endpoint: settings.sesEndpoint }),
      })
    : null;
  const sms = settings.smsOriginationIdentity
    ? new SmsOtpSender({
        region: settings.region,
        originationIdentity: settings.smsOriginationIdentity,
        ttlSeconds,
        ...(settings.smsConfigurationSet && { configurationSet: settings.smsConfigurationSet }),
      })
    : null;
  return {
    sender: new ChannelOtpSender({ email: email ?? unavailable, sms: sms ?? unavailable }),
    activeChannels: [...(email ? ['email' as const] : []), ...(sms ? ['sms' as const] : [])],
  };
}

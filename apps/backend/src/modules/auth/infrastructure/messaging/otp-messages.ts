import { type OtpLanguage } from '../../application/ports/auth.ports';

/**
 * Textos del código de verificación (pending-scope T6), en los idiomas de la app.
 *
 * El SMS es corto y en una sola parte (GSM-7, sin tildes ni emojis) para no pagar dos segmentos, y
 * dice "codigo"/"code" para que iOS lo ofrezca como autocompletado.
 */
export interface OtpMessageInput {
  code: string;
  ttlSeconds: number;
  language: OtpLanguage;
}

export function otpTtlMinutes(ttlSeconds: number): number {
  return Math.max(1, Math.ceil(ttlSeconds / 60));
}

const SMS: Record<OtpLanguage, (code: string, minutes: number) => string> = {
  es: (code, minutes) =>
    `Ayni: tu codigo de verificacion es ${code}. Vence en ${minutes} min. No lo compartas con nadie.`,
  en: (code, minutes) =>
    `Ayni: your verification code is ${code}. It expires in ${minutes} min. Do not share it.`,
};

export function otpSmsText({ code, ttlSeconds, language }: OtpMessageInput): string {
  return SMS[language](code, otpTtlMinutes(ttlSeconds));
}

export interface OtpEmail {
  subject: string;
  text: string;
  html: string;
}

const EMAIL: Record<
  OtpLanguage,
  { subject: string; intro: string; expiry: (minutes: number) => string; ignore: string }
> = {
  es: {
    subject: 'Tu código de verificación de Ayni',
    intro: 'Tu código de verificación de Ayni es',
    expiry: (minutes) =>
      `Vence en ${minutes} minutos. No lo compartas con nadie: Ayni nunca te lo pedirá.`,
    ignore: 'Si no lo pediste, ignora este correo.',
  },
  en: {
    subject: 'Your Ayni verification code',
    intro: 'Your Ayni verification code is',
    expiry: (minutes) =>
      `It expires in ${minutes} minutes. Do not share it with anyone: Ayni will never ask you for it.`,
    ignore: "If you didn't request it, ignore this email.",
  },
};

export function otpEmail({ code, ttlSeconds, language }: OtpMessageInput): OtpEmail {
  const copy = EMAIL[language];
  const expiry = copy.expiry(otpTtlMinutes(ttlSeconds));
  return {
    subject: copy.subject,
    text: [`${copy.intro} ${code}.`, '', expiry, '', copy.ignore].join('\n'),
    // El código son solo dígitos (RandomOtpGenerator) y los textos son fijos: no hace falta escapar.
    html: [
      `<!doctype html><html lang="${language}"><body style="font-family:Arial,sans-serif;color:#1f2937">`,
      `<p>${copy.intro}:</p>`,
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>`,
      `<p>${expiry}</p>`,
      `<p style="color:#6b7280">${copy.ignore}</p>`,
      '</body></html>',
    ].join(''),
  };
}

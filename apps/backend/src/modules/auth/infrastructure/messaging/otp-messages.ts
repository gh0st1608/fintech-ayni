/**
 * Textos del código de verificación (pending-scope T6). Solo español por ahora: el puerto de envío
 * todavía no recibe el idioma del usuario.
 *
 * El SMS es corto y en una sola parte (GSM-7, sin tildes ni emojis) para no pagar dos segmentos, y
 * dice "codigo" para que iOS lo ofrezca como autocompletado.
 */
export interface OtpMessageInput {
  code: string;
  ttlSeconds: number;
}

export function otpTtlMinutes(ttlSeconds: number): number {
  return Math.max(1, Math.ceil(ttlSeconds / 60));
}

export function otpSmsText({ code, ttlSeconds }: OtpMessageInput): string {
  return `Ayni: tu codigo de verificacion es ${code}. Vence en ${otpTtlMinutes(ttlSeconds)} min. No lo compartas con nadie.`;
}

export interface OtpEmail {
  subject: string;
  text: string;
  html: string;
}

export function otpEmail({ code, ttlSeconds }: OtpMessageInput): OtpEmail {
  const minutes = otpTtlMinutes(ttlSeconds);
  return {
    subject: 'Tu código de verificación de Ayni',
    text: [
      `Tu código de verificación de Ayni es ${code}.`,
      '',
      `Vence en ${minutes} minutos. No lo compartas con nadie: Ayni nunca te lo pedirá.`,
      '',
      'Si no lo pediste, ignora este correo.',
    ].join('\n'),
    // El código son solo dígitos (RandomOtpGenerator): no hace falta escaparlo.
    html: [
      '<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#1f2937">',
      '<p>Tu código de verificación de Ayni es:</p>',
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>`,
      `<p>Vence en ${minutes} minutos. No lo compartas con nadie: Ayni nunca te lo pedirá.</p>`,
      '<p style="color:#6b7280">Si no lo pediste, ignora este correo.</p>',
      '</body></html>',
    ].join(''),
  };
}

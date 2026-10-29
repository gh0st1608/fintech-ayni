import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifica la firma de un webhook de Mercado Pago (header `x-signature: ts=…,v1=…`). El hash es
 * el HMAC-SHA256 en hexadecimal, con la clave secreta de la aplicación, del manifiesto
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. El `data.id` alfanumérico va en minúsculas.
 * Se omiten del manifiesto las partes que no llegan, como indica Mercado Pago.
 *
 * `maxAgeSeconds` rechaza notificaciones viejas (reenvíos capturados).
 */
export function isValidWebhookSignature(input: {
  signature: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
  secret: string;
  now: Date;
  maxAgeSeconds: number;
}): boolean {
  const parts = Object.fromEntries(
    (input.signature ?? '')
      .split(',')
      .map((part) => part.split('=', 2).map((value) => value.trim()))
      .filter((pair): pair is [string, string] => pair.length === 2 && pair[0] !== ''),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  // Mercado Pago manda `ts` en milisegundos o segundos según la versión: se aceptan ambos.
  const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
  if (Math.abs(input.now.getTime() - tsMs) > input.maxAgeSeconds * 1000) return false;

  let manifest = '';
  if (input.dataId) manifest += `id:${input.dataId.toLowerCase()};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${ts};`;
  const expected = createHmac('sha256', input.secret).update(manifest).digest();
  const received = Buffer.from(v1, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

import { AppError } from '@/domain/shared/errors/AppError';
import { isValidYapePhone } from '@/domain/payments/yapePhone';

import { MercadoPagoPaymentTokenizer } from './MercadoPagoPaymentTokenizer';

const CARD = {
  number: '4009 1753 3280 6176',
  holderName: ' Ana Pérez ',
  expirationMonth: 11,
  expirationYear: 2030,
  securityCode: '123',
  documentNumber: '12345678',
};

function tokenizer(...responses: (Response | Error)[]) {
  const http = jest.fn<Promise<Response>, [string, RequestInit]>();
  for (const response of responses) {
    if (response instanceof Error) http.mockRejectedValueOnce(response);
    else http.mockResolvedValueOnce(response);
  }
  const ids = { next: jest.fn(() => 'req-uuid-1') };
  const mp = new MercadoPagoPaymentTokenizer(
    { publicKey: 'TEST-pk-123', apiUrl: 'https://api.test/', timeoutMs: 1000 },
    ids,
    http,
  );
  return { http, ids, mp };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const callOf = (http: jest.Mock, index = 0) => {
  const [url, init] = http.mock.calls[index] as [string, RequestInit];
  return { url, method: init.method, body: JSON.parse(init.body as string) as unknown };
};

describe('MercadoPagoPaymentTokenizer (COPAYNI-34 y 63)', () => {
  it('tokeniza Yape con la public key, el celular, el OTP y un requestId nuevo', async () => {
    const { http, mp } = tokenizer(json({ id: 'yape-token-1', live_mode: false }, 201));
    await expect(mp.tokenizeYape({ phoneNumber: '111 111 111', otp: '123456' })).resolves.toBe(
      'yape-token-1',
    );
    expect(callOf(http)).toEqual({
      url: 'https://api.test/platforms/pci/yape/v1/payment?public_key=TEST-pk-123',
      method: 'POST',
      body: { phoneNumber: '111111111', otp: '123456', requestId: 'req-uuid-1' },
    });
  });

  it('tokeniza una tarjeta con el titular y su DNI o carné de extranjería', async () => {
    const { http, mp } = tokenizer(json({ id: 'card-token-1' }), json({ id: 'card-token-2' }));
    await expect(mp.tokenizeCard(CARD)).resolves.toBe('card-token-1');
    expect(callOf(http)).toEqual({
      url: 'https://api.test/v1/card_tokens?public_key=TEST-pk-123',
      method: 'POST',
      body: {
        card_number: '4009175332806176',
        expiration_month: 11,
        expiration_year: 2030,
        security_code: '123',
        cardholder: { name: 'Ana Pérez', identification: { type: 'DNI', number: '12345678' } },
      },
    });
    await mp.tokenizeCard({ ...CARD, documentNumber: '001234567' });
    expect(callOf(http, 1).body).toMatchObject({
      cardholder: { identification: { type: 'C.E', number: '001234567' } },
    });
  });

  it('un 4xx es un rechazo con código; 429 y 5xx son transitorios', async () => {
    const yape = tokenizer(json({ message: 'invalid otp' }, 400));
    await expect(yape.mp.tokenizeYape({ phoneNumber: '111111111', otp: '000000' })).rejects.toEqual(
      expect.objectContaining({ kind: 'business', code: 'YAPE_REJECTED', status: 400 }),
    );
    const card = tokenizer(json({}, 422));
    await expect(card.mp.tokenizeCard(CARD)).rejects.toMatchObject({ code: 'CARD_REJECTED' });

    const busy = tokenizer(json({}, 429), json({}, 503));
    await expect(busy.mp.tokenizeCard(CARD)).rejects.toMatchObject({ kind: 'rate_limited' });
    const failed = busy.mp.tokenizeCard(CARD);
    await expect(failed).rejects.toMatchObject({ kind: 'server' });
    await expect(failed).rejects.toHaveProperty('isTransient', true);
  });

  it('sin red o sin token en la respuesta falla con un AppError', async () => {
    const offline = tokenizer(new TypeError('Network request failed'));
    await expect(offline.mp.tokenizeCard(CARD)).rejects.toMatchObject({ kind: 'network' });
    const empty = tokenizer(json({ status: 'ok' }));
    const error = await empty.mp
      .tokenizeYape({ phoneNumber: '111111111', otp: '123456' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ kind: 'unknown' });
  });

  it('cada intento de Yape pide un requestId nuevo', async () => {
    const { ids, mp } = tokenizer(json({ id: 'a' }), json({ id: 'b' }));
    await mp.tokenizeYape({ phoneNumber: '111111111', otp: '123456' });
    await mp.tokenizeYape({ phoneNumber: '111111111', otp: '654321' });
    expect(ids.next).toHaveBeenCalledTimes(2);
  });
});

describe('Celular de Yape', () => {
  it('en producción exige 9 dígitos que empiecen con 9; en el sandbox, solo 9 dígitos', () => {
    expect(isValidYapePhone('987654321', { sandbox: false })).toBe(true);
    expect(isValidYapePhone('111111111', { sandbox: false })).toBe(false);
    expect(isValidYapePhone('111111111', { sandbox: true })).toBe(true);
    expect(isValidYapePhone('11111111', { sandbox: true })).toBe(false);
    expect(isValidYapePhone('+51987654321', { sandbox: true })).toBe(false);
  });
});

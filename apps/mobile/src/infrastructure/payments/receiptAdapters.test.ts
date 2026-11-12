import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';

import { PaymentApiRepository } from './PaymentApiRepository';

describe('comprobante por HTTP (COPAYNI-80)', () => {
  function setup(response: Response) {
    const fetchImpl = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
    fetchImpl.mockResolvedValue(response);
    const http = new FetchHttpClient({
      baseUrl: 'https://api.test/v1',
      timeoutMs: 1000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    return { fetchImpl, repository: new PaymentApiRepository(http) };
  }

  it('descarga los bytes del PDF con el tipo y el idioma', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4');
    const { fetchImpl, repository } = setup(
      new Response(pdf, { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    );
    const file = await repository.getReceipt('payout', 'abcdef12-3456', 'en');
    expect(file.filename).toBe('ayni-comprobante-abcdef12.pdf');
    expect(new TextDecoder().decode(file.bytes)).toBe('%PDF-1.4');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.test/v1/me/transactions/abcdef12-3456/receipt?type=payout&lang=en',
    );
    expect((init?.headers as Record<string, string>).Accept).toBe('*/*');
  });

  it('un movimiento ajeno llega como el error del backend', async () => {
    const { repository } = setup(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: 'TRANSACTION_NOT_FOUND', message: 'No se encontró el movimiento' },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(repository.getReceipt('payment', 'x', 'es')).rejects.toMatchObject({
      kind: 'not_found',
      code: 'TRANSACTION_NOT_FOUND',
    });
  });
});

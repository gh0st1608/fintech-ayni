import { type HandleIdentityWebhookUseCase } from '@src/modules/documents/application/identity-verification.use-cases';
import { VerificaIdWebhookController } from '@src/modules/documents/presentation/verificaid-webhook.controller';

const TOKEN = 'token-del-webhook-de-prueba-con-32-caracteres';

function setup(token: string | null = TOKEN) {
  const handle = { execute: jest.fn(() => Promise.resolve()) };
  const controller = new VerificaIdWebhookController(
    handle as unknown as HandleIdentityWebhookUseCase,
    { token },
  );
  return { handle, controller };
}

describe('VerificaIdWebhookController (COPAYNI-42)', () => {
  it('con el token correcto consulta la sesión de kyc.created y kyc.updated', async () => {
    const { controller, handle } = setup();
    for (const event_type of ['kyc.created', 'kyc.updated']) {
      await expect(
        controller.receive(TOKEN, { event_type, payload: { id: 'ses-1' } }),
      ).resolves.toEqual({ received: true });
    }
    expect(handle.execute).toHaveBeenCalledTimes(2);
    expect(handle.execute).toHaveBeenCalledWith('ses-1');
  });

  it.each([
    ['sin token configurado', null, TOKEN],
    ['sin token en la URL', TOKEN, undefined],
    ['con otro token', TOKEN, 'otro-token'],
  ] as const)('rechaza %s', async (_, configured, received) => {
    const { controller, handle } = setup(configured);
    await expect(
      controller.receive(received, { event_type: 'kyc.updated', payload: { id: 'ses-1' } }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(handle.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['otro evento', { event_type: 'kyc.deleted', payload: { id: 'ses-1' } }],
    ['sin sesión', { event_type: 'kyc.updated', payload: {} }],
    ['sesión que no es texto', { event_type: 'kyc.updated', payload: { id: 42 } }],
    ['sesión vacía', { event_type: 'kyc.updated', payload: { id: '' } }],
    ['sesión demasiado larga', { event_type: 'kyc.updated', payload: { id: 'x'.repeat(65) } }],
    ['cuerpo vacío', undefined],
  ])('confirma sin consultar: %s', async (_, body) => {
    const { controller, handle } = setup();
    await expect(controller.receive(TOKEN, body as never)).resolves.toEqual({ received: true });
    expect(handle.execute).not.toHaveBeenCalled();
  });
});

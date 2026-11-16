import {
  AgreementNotPendingError,
  DocumentsNotReadError,
  SignatureRejectedError,
} from '@/domain/agreements/errors/SignatureErrors';
import type { MembershipAgreement } from '@/domain/agreements/MembershipAgreement';
import {
  FAKE_SIGNATURE_CODE,
  InMemoryAgreementRepository,
} from '@/infrastructure/agreements/InMemoryAgreementRepository';

import {
  ListAgreementsUseCase,
  ListPendingAgreementsUseCase,
  ReadAgreementDocumentUseCase,
  RequestSignatureCodeUseCase,
  SignAgreementUseCase,
} from './agreementUseCases';

function setup(options: { maxAttempts?: number } = {}) {
  const agreements = new InMemoryAgreementRepository({ latencyMs: 0, ...options });
  return {
    agreements,
    list: new ListAgreementsUseCase(agreements),
    pending: new ListPendingAgreementsUseCase(agreements),
    read: new ReadAgreementDocumentUseCase(agreements),
    requestCode: new RequestSignatureCodeUseCase(agreements),
    sign: new SignAgreementUseCase(agreements),
  };
}

/** Lee los dos documentos y devuelve el acuerdo ya listo para pedir el código. */
async function readBoth(setupResult: ReturnType<typeof setup>): Promise<MembershipAgreement> {
  const [agreement] = await setupResult.list.execute();
  await setupResult.read.execute(agreement!.id, 'contract');
  await setupResult.read.execute(agreement!.id, 'promissoryNote');
  const [refreshed] = await setupResult.list.execute();
  return refreshed!;
}

describe('Casos de uso de la firma del contrato y del pagaré (COPAYNI-89)', () => {
  it('al unirse, el acuerdo queda pendiente con los dos documentos sin leer', async () => {
    const context = setup();
    const [agreement] = await context.list.execute();

    expect(agreement).toMatchObject({ status: 'pending', signedAt: null });
    expect(agreement!.unread).toEqual(['contract', 'promissoryNote']);
    await expect(context.pending.execute()).resolves.toHaveLength(1);
  });

  it('leer un documento devuelve su texto y lo marca leído', async () => {
    const context = setup();
    const [agreement] = await context.list.execute();
    const document = await context.read.execute(agreement!.id, 'contract');

    expect(document).toMatchObject({ document: 'contract', version: 'contract-provisional-1' });
    expect(document.text.length).toBeGreaterThan(0);
    const [afterRead] = await context.list.execute();
    expect(afterRead!.unread).toEqual(['promissoryNote']);
  });

  it('no se puede pedir el código mientras falte leer un documento', async () => {
    const context = setup();
    const [agreement] = await context.list.execute();
    await context.read.execute(agreement!.id, 'contract');
    const [afterRead] = await context.list.execute();

    // Se corta en la app, sin gastar un viaje ni un SMS.
    expect(() => context.requestCode.execute(afterRead!)).toThrow(DocumentsNotReadError);
    try {
      context.requestCode.execute(afterRead!);
    } catch (error) {
      expect((error as DocumentsNotReadError).pending).toEqual(['promissoryNote']);
    }
  });

  it('con los dos leídos pide el código y el correcto firma ambos documentos', async () => {
    const context = setup();
    const agreement = await readBoth(context);
    const challenge = await context.requestCode.execute(agreement);

    expect(challenge.maskedDestination).toContain('•');
    const signed = await context.sign.execute(agreement.id, FAKE_SIGNATURE_CODE);
    expect(signed.status).toBe('signed');
    expect(signed.signedAt).toBeInstanceOf(Date);
    await expect(context.pending.execute()).resolves.toEqual([]);
  });

  it('un código incorrecto no firma y avisa cuántos intentos quedan', async () => {
    const context = setup({ maxAttempts: 3 });
    const agreement = await readBoth(context);
    await context.requestCode.execute(agreement);

    await expect(context.sign.execute(agreement.id, '9999')).rejects.toMatchObject({
      code: 'SIGNATURE_REJECTED',
      reason: 'invalid',
      attemptsRemaining: 2,
    });
    await expect(context.pending.execute()).resolves.toHaveLength(1);
  });

  it('agotar los intentos bloquea la firma hasta pedir un código nuevo', async () => {
    const context = setup({ maxAttempts: 2 });
    const agreement = await readBoth(context);
    await context.requestCode.execute(agreement);

    await expect(context.sign.execute(agreement.id, '9999')).rejects.toMatchObject({
      reason: 'invalid',
    });
    const rejection = await context.sign
      .execute(agreement.id, '9999')
      .catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(SignatureRejectedError);
    expect((rejection as SignatureRejectedError).reason).toBe('attempts_exceeded');
    expect((rejection as SignatureRejectedError).requiresResend).toBe(true);
  });

  it('un código vencido no firma y pide uno nuevo', async () => {
    let now = new Date('2026-11-16T15:00:00.000Z');
    const agreements = new InMemoryAgreementRepository({
      latencyMs: 0,
      codeTtlSeconds: 300,
      now: () => now,
    });
    const [agreement] = await agreements.list();
    await agreements.readDocument(agreement!.id, 'contract');
    await agreements.readDocument(agreement!.id, 'promissoryNote');
    const [ready] = await agreements.list();
    await new RequestSignatureCodeUseCase(agreements).execute(ready!);

    now = new Date('2026-11-16T15:06:00.000Z');
    const rejection = await new SignAgreementUseCase(agreements)
      .execute(ready!.id, FAKE_SIGNATURE_CODE)
      .catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(SignatureRejectedError);
    expect((rejection as SignatureRejectedError).reason).toBe('expired');
  });

  it('un acuerdo ya firmado no admite otra firma', async () => {
    const context = setup();
    const agreement = await readBoth(context);
    await context.requestCode.execute(agreement);
    await context.sign.execute(agreement.id, FAKE_SIGNATURE_CODE);

    const [signed] = await context.list.execute();
    expect(() => context.requestCode.execute(signed!)).toThrow(AgreementNotPendingError);
    await expect(context.sign.execute(agreement.id, FAKE_SIGNATURE_CODE)).rejects.toBeInstanceOf(
      AgreementNotPendingError,
    );
  });
});

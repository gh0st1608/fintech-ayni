import {
  AgreementNotPendingError,
  DocumentsNotReadError,
  SignatureRejectedError,
} from '@/domain/agreements/errors/SignatureErrors';
import { AppError } from '@/domain/shared/errors/AppError';
import type { HttpBodyRequestOptions, HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

import { AgreementApiRepository } from './AgreementApiRepository';

function httpReturning(data: unknown) {
  const calls: { path: string; options: HttpBodyRequestOptions<unknown> }[] = [];
  const respond = (path: string, options: HttpBodyRequestOptions<unknown> = {}) => {
    calls.push({ path, options });
    return Promise.resolve(options.parse ? options.parse(data) : data);
  };
  return {
    http: { get: jest.fn(respond), post: jest.fn(respond) } as unknown as HttpClientPort,
    calls,
  };
}

function httpRejecting(error: unknown) {
  const reject = () => Promise.reject(error);
  return { get: jest.fn(reject), post: jest.fn(reject) } as unknown as HttpClientPort;
}

const AGREEMENT = {
  id: 'a-1',
  circleId: 'c-1',
  position: 4,
  status: 'pending',
  expiresAt: '2026-11-18T15:00:00.000Z',
  signedAt: null,
  unread: ['contract', 'promissory_note'],
};

describe('AgreementApiRepository (COPAYNI-89)', () => {
  it('mapea la lista y traduce promissory_note al nombre del dominio', async () => {
    const { http, calls } = httpReturning({ agreements: [AGREEMENT] });
    const agreements = await new AgreementApiRepository(http).list();

    expect(calls[0]?.path).toBe('/me/agreements');
    expect(agreements).toEqual([
      {
        id: 'a-1',
        circleId: 'c-1',
        position: 4,
        status: 'pending',
        expiresAt: new Date('2026-11-18T15:00:00.000Z'),
        signedAt: null,
        unread: ['contract', 'promissoryNote'],
      },
    ]);
  });

  it('pide el documento con el nombre del contrato de API y devuelve su texto', async () => {
    const { http, calls } = httpReturning({
      document: 'promissory_note',
      version: 'promissory_note-provisional-1',
      text: 'PAGARÉ…',
      hash: '9f86d081',
      readAt: '2026-11-16T15:04:00.000Z',
    });
    const document = await new AgreementApiRepository(http).readDocument('a-1', 'promissoryNote');

    expect(calls[0]?.path).toBe('/me/agreements/a-1/documents/promissory_note');
    expect(document).toMatchObject({ document: 'promissoryNote', hash: '9f86d081' });
    expect(document.readAt).toEqual(new Date('2026-11-16T15:04:00.000Z'));
  });

  it('firma enviando el código y devuelve el acuerdo firmado', async () => {
    const { http, calls } = httpReturning({
      ...AGREEMENT,
      status: 'signed',
      signedAt: '2026-11-16T15:05:00.000Z',
      unread: [],
    });
    const signed = await new AgreementApiRepository(http).sign('a-1', '1234');

    expect(calls[0]?.path).toBe('/me/agreements/a-1/signature');
    expect(calls[0]?.options.body).toEqual({ code: '1234' });
    expect(signed.status).toBe('signed');
    expect(signed.signedAt).toEqual(new Date('2026-11-16T15:05:00.000Z'));
  });

  it.each([
    ['SIGNATURE_CODE_INVALID', 'invalid'],
    ['SIGNATURE_CODE_EXPIRED', 'expired'],
    ['SIGNATURE_ATTEMPTS_EXCEEDED', 'attempts_exceeded'],
  ])('traduce %s a un rechazo de firma del dominio', async (code, reason) => {
    const http = httpRejecting(
      new AppError('validation', 'rejected', { code, fieldErrors: { attemptsRemaining: '2' } }),
    );
    const error = await new AgreementApiRepository(http)
      .sign('a-1', '9999')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SignatureRejectedError);
    expect((error as SignatureRejectedError).reason).toBe(reason);
    expect((error as SignatureRejectedError).attemptsRemaining).toBe(2);
  });

  it('traduce los documentos sin leer y el acuerdo que ya no admite firma', async () => {
    const notRead = httpRejecting(
      new AppError('validation', 'not read', {
        code: 'AGREEMENT_DOCUMENTS_NOT_READ',
        fieldErrors: { pending: 'contract, promissory_note' },
      }),
    );
    const pending = await new AgreementApiRepository(notRead)
      .requestSignatureCode('a-1')
      .catch((caught: unknown) => caught);
    expect(pending).toBeInstanceOf(DocumentsNotReadError);
    expect((pending as DocumentsNotReadError).pending).toEqual(['contract', 'promissoryNote']);

    const notPending = httpRejecting(
      new AppError('conflict', 'not pending', {
        code: 'AGREEMENT_NOT_PENDING',
        fieldErrors: { status: 'expired' },
      }),
    );
    const conflict = await new AgreementApiRepository(notPending)
      .sign('a-1', '1234')
      .catch((caught: unknown) => caught);
    expect(conflict).toBeInstanceOf(AgreementNotPendingError);
    expect((conflict as AgreementNotPendingError).status).toBe('expired');
  });

  it('un fallo de red no se disfraza de rechazo de firma', async () => {
    const http = httpRejecting(new AppError('network', 'offline'));
    const error = await new AgreementApiRepository(http)
      .sign('a-1', '1234')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).kind).toBe('network');
  });
});

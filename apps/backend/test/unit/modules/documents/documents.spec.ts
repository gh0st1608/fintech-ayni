import { Logger } from '@nestjs/common';

import {
  ListDocumentsUseCase,
  RequestUploadUseCase,
  SubmitDocumentUseCase,
} from '@src/modules/documents/application/documents.use-cases';
import {
  type DocumentRepositoryPort,
  type DocumentStoragePort,
  type StoredDocument,
  type Upload,
} from '@src/modules/documents/application/ports';
import { InvalidUploadError, UploadNotUsableError } from '@src/modules/documents/domain/document';
import {
  ManualKycReview,
  SimulatedDocumentStorage,
  SimulatedKycProvider,
} from '@src/modules/documents/infrastructure/simulated-kyc';
import { DocumentsResponse } from '@src/modules/documents/presentation/documents.dto';
import { Money } from '@src/shared/domain/value-objects/money';
import { ValidationError } from '@src/shared/errors/app-error';

const NOW = new Date('2026-10-30T15:00:00Z');
const ANA = { userId: 'u-1' };
const clock = { now: () => NOW };

function setup(provider = new SimulatedKycProvider('approved'), stored = true) {
  const uploads = new Map<string, Upload>();
  const documents: DocumentRepositoryPort = {
    createUpload: jest.fn((upload: Omit<Upload, 'usedAt'>) => {
      uploads.set(upload.id, { ...upload, usedAt: null });
      return Promise.resolve();
    }),
    upload: (id) => Promise.resolve(uploads.get(id) ?? null),
    submit: jest.fn((props: Parameters<DocumentRepositoryPort['submit']>[0]) =>
      Promise.resolve<StoredDocument>({
        id: 'doc-1',
        type: props.type,
        kind: props.kind,
        status: props.result.status,
        reason: props.result.reason,
        monthlyIncome: props.monthlyIncome,
        pages: props.uploadIds.length,
        submittedAt: NOW,
        reviewedAt: null,
      }),
    ),
    list: () => Promise.resolve([]),
  };
  const simulated = new SimulatedDocumentStorage(() => NOW);
  const storage: DocumentStoragePort = {
    presignUpload: (props) => simulated.presignUpload(props),
    exists: () => Promise.resolve(stored),
  };
  const request = new RequestUploadUseCase(documents, storage, { uploadUrlTtlSeconds: 300 });
  const submit = new SubmitDocumentUseCase(documents, storage, provider, provider, clock);
  const upload = async (purpose: Upload['purpose'], userId = ANA.userId): Promise<string> =>
    (await request.execute({ userId }, { purpose, contentType: 'image/jpeg', sizeBytes: 1024 }))
      .uploadId;
  return { uploads, documents, request, submit, upload };
}

describe('Documentos KYC (COPAYNI-43, 47, 48 y 49)', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('la URL de subida vence en minutos y la clave no lleva datos personales', async () => {
    const { request, uploads } = setup();
    const ticket = await request.execute(ANA, {
      purpose: 'national_id_front',
      contentType: 'application/pdf',
      sizeBytes: 2048,
    });
    expect(ticket.expiresAt).toEqual(new Date(NOW.getTime() + 300_000));
    expect(ticket.uploadUrl).toContain(`kyc/u-1/national_id_front/${ticket.uploadId}`);
    expect(uploads.get(ticket.uploadId)).toMatchObject({ sizeBytes: 2048, usedAt: null });
  });

  it('rechaza tipos de archivo y tamaños no admitidos', async () => {
    const { request } = setup();
    for (const [contentType, sizeBytes] of [
      ['image/gif', 10],
      ['image/png', 0],
      ['image/png', 10 * 1024 * 1024 + 1],
      ['image/png', 1.5],
    ] as const) {
      await expect(
        request.execute(ANA, { purpose: 'additional', contentType, sizeBytes }),
      ).rejects.toBeInstanceOf(InvalidUploadError);
    }
  });

  it('verifica el National ID con el anverso y el reverso', async () => {
    const { submit, upload, documents } = setup();
    const document = await submit.nationalId(ANA, {
      frontUploadId: await upload('national_id_front'),
      backUploadId: await upload('national_id_back'),
    });
    expect(document).toMatchObject({ type: 'national_id', status: 'approved', pages: 2 });
    expect(documents.submit).toHaveBeenCalledWith(
      expect.objectContaining({ result: { status: 'approved', reason: null } }),
    );
  });

  it('un rechazo trae el motivo para reintentar', async () => {
    const { submit, upload } = setup(new SimulatedKycProvider('rejected'));
    const document = await submit.nationalId(ANA, {
      frontUploadId: await upload('national_id_front'),
      backUploadId: await upload('national_id_back'),
    });
    expect(document.status).toBe('rejected');
    expect(document.reason).toMatch(/vuelve a escanearlo/);
  });

  it('no acepta subidas ajenas, de otro propósito, usadas, vencidas o sin archivo', async () => {
    const { submit, upload, uploads } = setup();
    const back = await upload('national_id_back');
    const modified = async (change: Partial<Upload>): Promise<string> => {
      const id = await upload('national_id_front');
      uploads.set(id, { ...uploads.get(id)!, ...change });
      return id;
    };
    const fronts = [
      await upload('national_id_front', 'u-2'),
      await upload('additional'),
      'nope',
      await modified({ usedAt: NOW }),
      await modified({ expiresAt: new Date('2026-10-28T00:00:00Z') }),
    ];
    for (const frontUploadId of fronts) {
      await expect(
        submit.nationalId(ANA, { frontUploadId, backUploadId: back }),
      ).rejects.toBeInstanceOf(UploadNotUsableError);
    }
    const missing = setup(undefined, false);
    await expect(
      missing.submit.nationalId(ANA, {
        frontUploadId: await missing.upload('national_id_front'),
        backUploadId: await missing.upload('national_id_back'),
      }),
    ).rejects.toBeInstanceOf(UploadNotUsableError);
  });

  it('el comprobante de ingresos guarda el ingreso y admite varias páginas', async () => {
    const { submit, upload } = setup(new SimulatedKycProvider('in_review'));
    const pages = [await upload('proof_of_income'), await upload('proof_of_income')];
    const document = await submit.proofOfIncome(ANA, {
      kind: 'bank_statement',
      monthlyIncome: Money.of(350_000, 'PEN'),
      uploadIds: pages,
    });
    expect(document).toMatchObject({
      type: 'proof_of_income',
      kind: 'bank_statement',
      status: 'in_review',
      pages: 2,
      monthlyIncome: Money.of(350_000, 'PEN'),
    });
  });

  it('valida el tipo, el ingreso y las páginas del comprobante', async () => {
    const { submit, upload } = setup();
    const page = await upload('proof_of_income');
    const income = Money.of(350_000, 'PEN');
    for (const command of [
      { kind: 'payslip', monthlyIncome: income, uploadIds: [page] },
      { kind: 'hr_letter', monthlyIncome: Money.zero('PEN'), uploadIds: [page] },
      { kind: 'hr_letter', monthlyIncome: income, uploadIds: [] },
      { kind: 'hr_letter', monthlyIncome: income, uploadIds: [page, page] },
    ]) {
      await expect(submit.proofOfIncome(ANA, command)).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('los documentos adicionales quedan en revisión manual', async () => {
    const { submit, upload } = setup();
    const document = await submit.additional(ANA, {
      kind: 'utility_bill',
      uploadIds: [await upload('additional')],
    });
    expect(document).toMatchObject({ type: 'additional', status: 'in_review' });
    await expect(
      submit.additional(ANA, { kind: 'selfie', uploadIds: [await upload('additional')] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('sin proveedor, todo queda en revisión de operaciones', async () => {
    const manual = new ManualKycReview();
    await expect(manual.verifyNationalId()).resolves.toEqual({ status: 'in_review', reason: null });
    await expect(manual.review()).resolves.toEqual({ status: 'in_review', reason: null });
    await expect(new SimulatedKycProvider('rejected').review()).resolves.toMatchObject({
      status: 'rejected',
      reason: expect.any(String),
    });
    await expect(new SimulatedDocumentStorage().exists()).resolves.toBe(true);
  });

  it('la lista resume el estado del último documento de cada tipo (COPAYNI-46)', async () => {
    const doc = (
      type: StoredDocument['type'],
      status: StoredDocument['status'],
    ): StoredDocument => ({
      id: `${type}-${status}`,
      type,
      kind: type === 'national_id' ? 'national_id' : 'hr_letter',
      status,
      reason: null,
      monthlyIncome: type === 'proof_of_income' ? Money.of(350_000, 'PEN') : null,
      pages: 1,
      submittedAt: NOW,
      reviewedAt: null,
    });
    const documents = [
      doc('proof_of_income', 'in_review'),
      doc('national_id', 'approved'),
      doc('national_id', 'rejected'),
    ];
    const repository = {
      list: () => Promise.resolve(documents),
    } as unknown as DocumentRepositoryPort;
    const listed = await new ListDocumentsUseCase(repository).execute(ANA);
    const response = DocumentsResponse.from(listed);
    expect(response.summary).toEqual({
      national_id: 'approved',
      proof_of_income: 'in_review',
      additional: 'not_submitted',
    });
    expect(response.items[0]).toMatchObject({
      monthlyIncome: { amount: 350_000, currency: 'PEN' },
      submittedAt: NOW.toISOString(),
    });
  });
});

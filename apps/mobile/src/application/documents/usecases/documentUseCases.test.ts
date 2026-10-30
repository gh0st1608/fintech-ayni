import { UnsupportedFileError, type LocalFile } from '@/domain/documents/LocalFile';
import { Money } from '@/domain/shared/value-objects/Money';
import {
  FakeFileUploader,
  FakeLocalFileCleaner,
  InMemoryDocumentRepository,
} from '@/infrastructure/documents/InMemoryDocumentRepository';

import {
  DocumentUploader,
  InvalidIncomeProofError,
  ListDocumentsUseCase,
  SubmitNationalIdUseCase,
  SubmitProofOfIncomeUseCase,
} from './documentUseCases';

const photo = (name: string, overrides: Partial<LocalFile> = {}): LocalFile => ({
  uri: `file:///cache/${name}.jpg`,
  mimeType: 'image/jpeg',
  sizeBytes: 200_000,
  ...overrides,
});

function setup(cleanerFails = false) {
  const documents = new InMemoryDocumentRepository({ latencyMs: 0 });
  const uploads = new FakeFileUploader();
  const cleaner = new FakeLocalFileCleaner(cleanerFails);
  const uploader = new DocumentUploader(documents, uploads, cleaner);
  return { documents, uploads, cleaner, uploader };
}

describe('Casos de uso de documentos', () => {
  it('sube ambas caras, borra las copias locales y envía el documento de identidad', async () => {
    const { documents, uploads, cleaner, uploader } = setup();
    const document = await new SubmitNationalIdUseCase(documents, uploader).execute(
      photo('front'),
      photo('back'),
    );
    expect(document).toMatchObject({ type: 'nationalId', status: 'approved', pages: 2 });
    expect(uploads.uploaded.map(({ url }) => url)).toEqual([
      expect.stringContaining('nationalIdFront'),
      expect.stringContaining('nationalIdBack'),
    ]);
    expect(cleaner.removed).toEqual(['file:///cache/front.jpg', 'file:///cache/back.jpg']);
    const overview = await new ListDocumentsUseCase(documents).execute();
    expect(overview.summary.nationalId).toBe('approved');
  });

  it('un fallo al borrar la copia local no interrumpe el envío', async () => {
    const { documents, uploader } = setup(true);
    await expect(
      new SubmitNationalIdUseCase(documents, uploader).execute(photo('f'), photo('b')),
    ).resolves.toMatchObject({ status: 'approved' });
  });

  it('rechaza archivos de otro tipo o muy grandes antes de subirlos', async () => {
    const { uploads, uploader } = setup();
    await expect(
      uploader.upload('additional', photo('gif', { mimeType: 'image/gif' })),
    ).rejects.toEqual(new UnsupportedFileError('type'));
    await expect(
      uploader.upload('additional', photo('big', { sizeBytes: 11 * 1024 * 1024 })),
    ).rejects.toEqual(new UnsupportedFileError('size'));
    expect(uploads.uploaded).toEqual([]);
  });

  it('envía el comprobante con el ingreso y valida ingreso y páginas', async () => {
    const { documents, uploader } = setup();
    const submit = new SubmitProofOfIncomeUseCase(documents, uploader);
    const income = Money.fromMajor(3_500, 'PEN');
    await expect(
      submit.execute('bankStatement', income, [
        photo('p1'),
        photo('p2', { mimeType: 'application/pdf' }),
      ]),
    ).resolves.toMatchObject({ type: 'proofOfIncome', pages: 2, monthlyIncome: income });
    await expect(submit.execute('hrLetter', Money.of(0, 'PEN'), [photo('p')])).rejects.toEqual(
      new InvalidIncomeProofError('income'),
    );
    await expect(submit.execute('hrLetter', income, [])).rejects.toEqual(
      new InvalidIncomeProofError('pages'),
    );
  });
});

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { PermissionDeniedError } from '@/domain/documents/ports/FilePorts';
import { AppError } from '@/domain/shared/errors/AppError';
import type { HttpBodyRequestOptions, HttpClientPort } from '@/domain/shared/ports/HttpClientPort';
import { Money } from '@/domain/shared/value-objects/Money';

import { DocumentApiRepository } from './DocumentApiRepository';
import { ExpoFilePicker, FetchFileUploader } from './ExpoFileAdapters';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ size: 1234, exists: true, delete: jest.fn() })),
}));

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

const DOCUMENT = {
  id: 'd-1',
  type: 'proof_of_income',
  kind: 'hr_letter',
  status: 'in_review',
  reason: null,
  monthlyIncome: { amount: 350000, currency: 'PEN' },
  pages: 1,
  submittedAt: '2026-10-30T15:00:00.000Z',
};

describe('DocumentApiRepository', () => {
  it('traduce la lista y el resumen por tipo', async () => {
    const { http } = httpReturning({
      summary: {
        national_id: 'approved',
        proof_of_income: 'in_review',
        additional: 'not_submitted',
      },
      items: [DOCUMENT],
    });
    const overview = await new DocumentApiRepository(http).list();
    expect(overview.summary).toEqual({
      nationalId: 'approved',
      proofOfIncome: 'inReview',
      additional: 'notSubmitted',
    });
    expect(overview.items[0]).toMatchObject({
      type: 'proofOfIncome',
      status: 'inReview',
      monthlyIncome: Money.of(350000, 'PEN'),
    });
  });

  it('pide la URL de subida y envía los documentos con los nombres del backend', async () => {
    const ticket = httpReturning({
      uploadId: 'u-1',
      uploadUrl: 'https://s3.test/k',
      expiresAt: '2026-10-30T15:05:00.000Z',
    });
    await expect(
      new DocumentApiRepository(ticket.http).requestUpload('nationalIdFront', 'image/jpeg', 10),
    ).resolves.toEqual({ uploadId: 'u-1', uploadUrl: 'https://s3.test/k' });
    expect(ticket.calls[0]!.options.body).toEqual({
      purpose: 'national_id_front',
      contentType: 'image/jpeg',
      sizeBytes: 10,
    });

    const income = httpReturning(DOCUMENT);
    await new DocumentApiRepository(income.http).submitProofOfIncome(
      'hrLetter',
      Money.of(350000, 'PEN'),
      ['u-1'],
    );
    expect(income.calls[0]).toMatchObject({
      path: '/me/documents/proof-of-income',
      options: { body: { kind: 'hr_letter', monthlyIncome: 350000, uploadIds: ['u-1'] } },
    });

    const id = httpReturning({
      ...DOCUMENT,
      type: 'national_id',
      kind: 'national_id',
      monthlyIncome: null,
    });
    await new DocumentApiRepository(id.http).submitNationalId('f', 'b');
    expect(id.calls[0]!.options.body).toEqual({ frontUploadId: 'f', backUploadId: 'b' });
  });
});

describe('ExpoFilePicker', () => {
  const picker = new ExpoFilePicker();

  it('sin permiso de cámara rechaza con PermissionDeniedError', async () => {
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValue({ granted: false } as never);
    await expect(picker.takePhoto()).rejects.toEqual(new PermissionDeniedError('camera'));
  });

  it('devuelve la foto con su tipo y tamaño, o null si se cancela', async () => {
    jest
      .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
      .mockResolvedValue({ granted: true } as never);
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.png', mimeType: 'image/png', fileSize: 99 }],
    } as never);
    await expect(picker.pickImage()).resolves.toEqual({
      uri: 'file:///a.png',
      mimeType: 'image/png',
      sizeBytes: 99,
    });
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValueOnce({ canceled: true, assets: null } as never);
    await expect(picker.pickImage()).resolves.toBeNull();
  });

  it('elige un PDF y toma el tamaño del archivo si el selector no lo da', async () => {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///s.pdf', name: 's.pdf' }],
    } as never);
    await expect(picker.pickPdf()).resolves.toEqual({
      uri: 'file:///s.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1234,
    });
  });
});

describe('FetchFileUploader', () => {
  const file = { uri: 'file:///a.jpg', mimeType: 'image/jpeg', sizeBytes: 3 };

  it('sube con PUT y el Content-Type firmado', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ blob: () => Promise.resolve('blob') })
      .mockResolvedValueOnce({ ok: true });
    await new FetchFileUploader(fetchImpl as unknown as typeof fetch).upload('https://s3/k', file);
    expect(fetchImpl).toHaveBeenLastCalledWith('https://s3/k', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: 'blob',
    });
  });

  it('un rechazo del almacenamiento o un corte es un AppError', async () => {
    const rejected = jest
      .fn()
      .mockResolvedValueOnce({ blob: () => Promise.resolve('blob') })
      .mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(
      new FetchFileUploader(rejected as unknown as typeof fetch).upload('u', file),
    ).rejects.toBeInstanceOf(AppError);
    const offline = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(
      new FetchFileUploader(offline as unknown as typeof fetch).upload('u', file),
    ).rejects.toMatchObject({ kind: 'network' });
  });
});

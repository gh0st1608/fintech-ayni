import { DomainError } from '@/domain/shared/errors/DomainError';

/**
 * Archivo elegido o fotografiado en el dispositivo, antes de subirlo. Solo vive hasta la subida:
 * después se borra la copia local (COPAYNI-47 y 48).
 */
export interface LocalFile {
  uri: string;
  mimeType: string;
  sizeBytes: number;
}

/** Mismas reglas que el backend: JPEG, PNG o PDF de hasta 10 MB. */
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Páginas de un comprobante (p. ej. 3 meses de extracto). */
export const MAX_PAGES = 10;

export class UnsupportedFileError extends DomainError {
  readonly code = 'UNSUPPORTED_FILE';

  constructor(readonly problem: 'type' | 'size') {
    super(`Unsupported file: ${problem}`);
  }
}

export function assertUploadable(file: LocalFile): void {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimeType)) {
    throw new UnsupportedFileError('type');
  }
  if (!Number.isInteger(file.sizeBytes) || file.sizeBytes < 1 || file.sizeBytes > MAX_FILE_BYTES) {
    throw new UnsupportedFileError('size');
  }
}

import { DomainError } from '@/domain/shared/errors/DomainError';

import type { LocalFile } from '../LocalFile';

export class PermissionDeniedError extends DomainError {
  readonly code = 'PERMISSION_DENIED';

  constructor(readonly permission: 'camera' | 'photos') {
    super(`Permission denied: ${permission}`);
  }
}

/** Cámara, galería y archivos del dispositivo. `null` si el usuario cancela. */
export interface FilePickerPort {
  /** Rechaza con PermissionDeniedError si no hay permiso de cámara. */
  takePhoto(): Promise<LocalFile | null>;
  pickImage(): Promise<LocalFile | null>;
  pickPdf(): Promise<LocalFile | null>;
}

/** Sube el archivo a la URL prefirmada con su Content-Type. */
export interface FileUploaderPort {
  upload(url: string, file: LocalFile): Promise<void>;
}

/** Borra la copia local del archivo una vez subido; un fallo no interrumpe el envío. */
export interface LocalFileCleanerPort {
  remove(file: LocalFile): Promise<void>;
}

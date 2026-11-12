/** Un archivo descargado, listo para guardar o compartir. */
export interface DownloadedFile {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * Hoja del sistema para guardar o compartir un archivo (COPAYNI-80): el comprobante en PDF. Si el
 * dispositivo no puede compartir, falla con `AppError('unknown', …, { code: 'SHARE_UNAVAILABLE' })`.
 */
export interface FileSharePort {
  share(file: DownloadedFile, dialogTitle: string): Promise<void>;
}

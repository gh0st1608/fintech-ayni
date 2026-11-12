import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { DownloadedFile, FileSharePort } from '@/domain/payments/ports/FileSharePort';
import { AppError } from '@/domain/shared/errors/AppError';

/**
 * Guarda el archivo en la caché de la app y abre la hoja de compartir del sistema, desde donde la
 * persona lo guarda en Archivos o lo envía (expo-file-system y expo-sharing, SDK 58).
 */
export class ExpoFileShare implements FileSharePort {
  async share(file: DownloadedFile, dialogTitle: string): Promise<void> {
    if (!(await Sharing.isAvailableAsync())) {
      throw new AppError('unknown', 'Sharing is not available', { code: 'SHARE_UNAVAILABLE' });
    }
    const target = new File(Paths.cache, file.filename);
    if (target.exists) target.delete();
    target.create();
    await target.write(file.bytes);
    await Sharing.shareAsync(target.uri, {
      mimeType: file.mimeType,
      UTI: 'com.adobe.pdf',
      dialogTitle,
    });
  }
}

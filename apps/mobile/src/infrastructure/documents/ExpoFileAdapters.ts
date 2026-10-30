import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import {
  type FilePickerPort,
  type FileUploaderPort,
  type LocalFileCleanerPort,
  PermissionDeniedError,
} from '@/domain/documents/ports/FilePorts';
import type { LocalFile } from '@/domain/documents/LocalFile';
import { AppError } from '@/domain/shared/errors/AppError';

/** Compresión de las fotos: legibles para el OCR y por debajo del límite de 10 MB. */
const PHOTO_QUALITY = 0.7;

function fromAsset(asset: {
  uri: string;
  mimeType?: string | null;
  fileSize?: number;
  size?: number;
}): LocalFile {
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    sizeBytes: asset.fileSize ?? asset.size ?? new File(asset.uri).size,
  };
}

/** Cámara y galería (expo-image-picker) y PDF (expo-document-picker). */
export class ExpoFilePicker implements FilePickerPort {
  async takePhoto(): Promise<LocalFile | null> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PermissionDeniedError('camera');
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: PHOTO_QUALITY,
    });
    return result.canceled || !result.assets[0] ? null : fromAsset(result.assets[0]);
  }

  async pickImage(): Promise<LocalFile | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new PermissionDeniedError('photos');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: PHOTO_QUALITY,
    });
    return result.canceled || !result.assets[0] ? null : fromAsset(result.assets[0]);
  }

  async pickPdf(): Promise<LocalFile | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    return result.canceled || !result.assets[0]
      ? null
      : fromAsset({
          ...result.assets[0],
          mimeType: result.assets[0].mimeType ?? 'application/pdf',
        });
  }
}

/** Sube el archivo con PUT a la URL prefirmada, con el Content-Type que se firmó. */
export class FetchFileUploader implements FileUploaderPort {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async upload(url: string, file: LocalFile): Promise<void> {
    let response: Response;
    try {
      const body = await (await this.fetchImpl(file.uri)).blob();
      response = await this.fetchImpl(url, {
        method: 'PUT',
        headers: { 'Content-Type': file.mimeType },
        body,
      });
    } catch (cause) {
      throw new AppError('network', 'Upload failed', { cause });
    }
    if (!response.ok) {
      throw new AppError('server', 'Upload rejected', { status: response.status });
    }
  }
}

/** Borra la copia en caché que crean la cámara y los selectores. */
export class ExpoLocalFileCleaner implements LocalFileCleanerPort {
  remove(file: LocalFile): Promise<void> {
    const local = new File(file.uri);
    if (local.exists) local.delete();
    return Promise.resolve();
  }
}

import type { FilePickerPort } from '@/domain/documents/ports/FilePorts';
import type { LocalFile } from '@/domain/documents/LocalFile';

/** Cámara y galería falsas: devuelven los archivos en orden; sin más, cancelan. */
export class FakeFilePicker implements FilePickerPort {
  private count = 0;

  constructor(private readonly files: (LocalFile | Error)[] = []) {}

  takePhoto(): Promise<LocalFile | null> {
    return this.next('photo');
  }

  pickImage(): Promise<LocalFile | null> {
    return this.next('image');
  }

  pickPdf(): Promise<LocalFile | null> {
    return this.next('pdf');
  }

  private next(source: string): Promise<LocalFile | null> {
    const file = this.files.shift();
    if (file instanceof Error) return Promise.reject(file);
    if (file) return Promise.resolve(file);
    this.count += 1;
    return Promise.resolve(
      source === 'cancel'
        ? null
        : {
            uri: `file:///cache/${source}-${this.count}.${source === 'pdf' ? 'pdf' : 'jpg'}`,
            mimeType: source === 'pdf' ? 'application/pdf' : 'image/jpeg',
            sizeBytes: 150_000,
          },
    );
  }
}

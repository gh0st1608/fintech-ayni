import {
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { InfrastructureError } from '../../../shared/errors/app-error';
import { type DocumentStoragePort } from '../application/ports';

export interface S3DocumentStorageOptions {
  bucket: string;
  region: string;
  /** Endpoint propio (floci en dev y pruebas); sin valor, el de AWS. Usa path-style. */
  endpoint?: string;
  now?: () => Date;
}

/**
 * Documentos en S3 (COPAYNI-43, docs/architecture.md §11). El bucket cifra con su clave KMS por
 * defecto (infra/terraform/modules/documents-bucket), así que la subida no manda cabeceras de
 * cifrado. La URL firma el Content-Type: la app tiene que subir con el mismo. Las credenciales
 * salen de la cadena por defecto del SDK (el rol de la tarea en ECS).
 */
export class S3DocumentStorage implements DocumentStoragePort {
  private readonly client: S3Client;
  private readonly now: () => Date;

  constructor(private readonly options: S3DocumentStorageOptions) {
    // Sin checksum por defecto: el SDK firmaría el CRC32 de un cuerpo vacío y S3 rechazaría la
    // subida de la app (BadDigest). La integridad la cubre la comprobación del tamaño.
    const config: S3ClientConfig = {
      region: options.region,
      requestChecksumCalculation: 'WHEN_REQUIRED',
    };
    if (options.endpoint) {
      config.endpoint = options.endpoint;
      config.forcePathStyle = true;
    }
    this.client = new S3Client(config);
    this.now = options.now ?? ((): Date => new Date());
  }

  async presignUpload(props: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: Date }> {
    const expiresAt = new Date(this.now().getTime() + props.expiresInSeconds * 1000);
    try {
      const url = await getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: props.key,
          ContentType: props.contentType,
        }),
        { expiresIn: props.expiresInSeconds },
      );
      return { url, expiresAt };
    } catch (error) {
      throw new InfrastructureError('El almacenamiento de documentos no responde', error);
    }
  }

  /** El archivo existe con el tamaño declarado; otro tamaño cuenta como subida incompleta. */
  async exists(key: string, sizeBytes: number): Promise<boolean> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
      return head.ContentLength === sizeBytes;
    } catch (error) {
      if (error instanceof NotFound || (error as { name?: string } | null)?.name === 'NotFound') {
        return false;
      }
      throw new InfrastructureError('El almacenamiento de documentos no responde', error);
    }
  }

  destroy(): void {
    this.client.destroy();
  }
}

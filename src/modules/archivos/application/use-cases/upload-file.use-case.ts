import { randomUUID } from 'node:crypto';
import { FileStoragePort } from '../../domain/ports/file-storage.port';

export class InvalidUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUploadError';
  }
}

export type UploadedPrivateFile = {
  key: string;
  mimeType: string;
  size: number;
  filename: string;
};

/**
 * Caso de uso reutilizable. La carpeta la decide cada módulo de negocio;
 * el archivo nunca se publica directamente y la extensión sale de la firma.
 */
export class UploadFileUseCase {
  static readonly MAX_BYTES = 10 * 1024 * 1024;

  constructor(private readonly storage: FileStoragePort) {}

  async execute(input: {
    buffer: Buffer;
    filename: string;
    prefix: string;
  }): Promise<UploadedPrivateFile> {
    const buffer = input.buffer;
    if (!buffer || buffer.length === 0) {
      throw new InvalidUploadError('Selecciona un archivo.');
    }
    if (buffer.length > UploadFileUseCase.MAX_BYTES) {
      throw new InvalidUploadError('El archivo no debe superar 10 MB.');
    }

    const type = detectFileType(buffer);
    if (!type) {
      throw new InvalidUploadError('Solo se admiten JPG, PNG, WebP y PDF.');
    }

    if (!/^marcas-gt\/empresas\/\d+\/[a-z0-9/-]+\/$/.test(input.prefix)) {
      throw new InvalidUploadError('El destino del archivo no es válido.');
    }

    const filename = (input.filename || 'comprobante').slice(0, 180);
    const key = input.prefix + randomUUID() + '.' + type.extension;
    await this.storage.put({ key, body: buffer, contentType: type.mimeType });
    return { key, mimeType: type.mimeType, size: buffer.length, filename };
  }
}

function detectFileType(buffer: Buffer): { mimeType: string; extension: string } | null {
  if (buffer.length >= 3 && buffer[0] === 0xff &&
      buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (buffer.length >= 12 &&
      buffer.subarray(0, 4).toString() === 'RIFF' &&
      buffer.subarray(8, 12).toString() === 'WEBP') {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString() === '%PDF-') {
    return { mimeType: 'application/pdf', extension: 'pdf' };
  }
  return null;
}

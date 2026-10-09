import { Injectable } from '@nestjs/common';
import { UploadFileUseCase, InvalidUploadError } from '../../../archivos';
import { FileStoragePort } from '../../../archivos';
import { DeliveryEvidenceStoragePort } from '../../application/ports/delivery-evidence-storage.port';

/** Usa el mismo almacenamiento privado que los comprobantes de Pagos. */
@Injectable()
export class DeliveryEvidenceSpacesAdapter implements DeliveryEvidenceStoragePort {
  constructor(
    private readonly uploader: UploadFileUseCase,
    private readonly storage: FileStoragePort,
  ) {}

  async upload(input: {
    empresaId: number;
    entregaId: number;
    tipo: string;
    content?: string;
    buffer?: Buffer;
    filename?: string;
    mimeType?: string | null;
  }) {
    let buffer = input.buffer;
    if (!buffer) {
      const match = /^data:([a-z0-9/+.-]+);base64,([a-zA-Z0-9+/=]+)$/.exec(input.content ?? '');
      if (!match) throw new InvalidUploadError('La evidencia debe ser un archivo válido.');
      if (match[2].length > UploadFileUseCase.MAX_BYTES * 4 / 3 + 12) {
        throw new InvalidUploadError('La evidencia no debe superar 10 MB.');
      }
      buffer = Buffer.from(match[2], 'base64');
    }
    const uploaded = await this.uploader.execute({
      buffer,
      filename: input.filename ?? 'evidencia',
      prefix: 'marcas-gt/empresas/' + input.empresaId +
        '/entregas/' + input.entregaId + '/evidencias/' +
        input.tipo.toLowerCase() + '/',
    });
    return {
      url: 'spaces://' + uploaded.key,
      key: uploaded.key,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
    };
  }

  async remove(key: string): Promise<void> {
    // Archivos históricos de Cloudinary conservan otra clave y no deben
    // borrarse con un proveedor incorrecto.
    if (!/^marcas-gt\/empresas\/\d+\/entregas\/\d+\/evidencias\//.test(key)) {
      return;
    }
    await this.storage.remove(key);
  }
}

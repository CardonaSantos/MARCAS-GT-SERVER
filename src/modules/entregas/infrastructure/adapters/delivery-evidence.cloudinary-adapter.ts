import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { DeliveryEvidenceStoragePort } from '../../application/ports/delivery-evidence-storage.port';

@Injectable()
export class DeliveryEvidenceCloudinaryAdapter implements DeliveryEvidenceStoragePort {
  async upload(input: { entregaId: number; tipo: string; content: string; mimeType?: string | null }) {
    const result = await cloudinary.uploader.upload(input.content, {
      folder: `entregas/${input.entregaId}/${input.tipo.toLowerCase()}`,
      resource_type: 'auto',
    });
    return {
      url: result.secure_url,
      key: result.public_id,
      mimeType: input.mimeType ?? (result.resource_type === 'image' ? `image/${result.format}` : null),
      size: result.bytes ?? null,
    };
  }
  async remove(key: string): Promise<void> {
    await cloudinary.uploader.destroy(key, { invalidate: true });
  }
}

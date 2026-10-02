export interface DeliveryEvidenceStoragePort {
  upload(input: {
    entregaId: number;
    tipo: string;
    content: string;
    mimeType?: string | null;
  }): Promise<{ url: string; key: string | null; mimeType: string | null; size: number | null }>;
  remove(key: string): Promise<void>;
}

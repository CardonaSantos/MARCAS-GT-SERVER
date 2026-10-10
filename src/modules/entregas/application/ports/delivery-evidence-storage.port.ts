export interface DeliveryEvidenceStoragePort {
  upload(input: {
    empresaId: number;
    entregaId: number;
    tipo: string;
    content?: string;
    buffer?: Buffer;
    filename?: string;
    mimeType?: string | null;
  }): Promise<{ url: string; key: string | null; mimeType: string | null; size: number | null }>;
  remove(key: string): Promise<void>;
}

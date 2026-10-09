export interface FileStoragePort {
  put(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void>;
  remove(key: string): Promise<void>;
  signedReadUrl(key: string, expiresSeconds?: number): Promise<string>;
}

export const FILE_STORAGE_PORT = Symbol('FILE_STORAGE_PORT');

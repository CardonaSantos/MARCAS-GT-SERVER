import { Module } from '@nestjs/common';
import { FileStoragePort, FILE_STORAGE_PORT } from './domain/ports/file-storage.port';
import { UploadFileUseCase } from './application/use-cases/upload-file.use-case';
import { SpacesStorageAdapter } from './infrastructure/spaces/spaces-storage.adapter';

@Module({
  providers: [
    {
      provide: FILE_STORAGE_PORT,
      useFactory: (): FileStoragePort => {
        // Configuración diferida: la app arranca sin Spaces hasta usar la carga.
        const values = {
          region: process.env.DO_SPACES_REGION,
          endpoint: process.env.DO_SPACES_ENDPOINT,
          key: process.env.DO_SPACES_KEY,
          secret: process.env.DO_SPACES_SECRET,
          bucket: process.env.DO_SPACES_BUCKET,
        };
        // La validación real de credenciales debe ocurrir al inicializar el
        // servicio, sin imprimirlas ni enviarlas al navegador.
        const adapter = new LazySpacesStorageAdapter(() => {
          for (const [name, value] of Object.entries(values)) {
            if (!value) {
              throw new Error('Falta configuración DO_SPACES_' + name.toUpperCase());
            }
          }
          return new SpacesStorageAdapter({
            region: values.region!,
            endpoint: values.endpoint!,
            key: values.key!,
            secret: values.secret!,
            bucket: values.bucket!,
          });
        });
        return adapter;
      },
    },
    {
      provide: UploadFileUseCase,
      useFactory: (storage: FileStoragePort) => new UploadFileUseCase(storage),
      inject: [FILE_STORAGE_PORT],
    },
  ],
  exports: [FILE_STORAGE_PORT, UploadFileUseCase],
})
export class ArchivosModule {}

class LazySpacesStorageAdapter implements FileStoragePort {
  private inner?: SpacesStorageAdapter;
  constructor(private readonly factory: () => SpacesStorageAdapter) {}
  private storage(): SpacesStorageAdapter {
    return (this.inner ??= this.factory());
  }
  put(input: { key: string; body: Buffer; contentType: string }) {
    return this.storage().put(input);
  }
  remove(key: string) {
    return this.storage().remove(key);
  }
  signedReadUrl(key: string, expiresSeconds?: number) {
    return this.storage().signedReadUrl(key, expiresSeconds);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { BODEGA_REPOSITORY } from '../../bodega.tokens';
import { BodegaDirectoryEntry } from '../../application/models/bodega.models';
import { BodegaDirectoryPort } from '../../application/ports/bodega-directory.port';
import { BodegaRepositoryPort } from '../../domain/ports/bodega.repository.port';

@Injectable()
export class BodegaDirectoryAdapter implements BodegaDirectoryPort {
  constructor(
    @Inject(BODEGA_REPOSITORY)
    private readonly repository: BodegaRepositoryPort,
  ) {}

  async findById(id: number): Promise<BodegaDirectoryEntry | null> {
    const bodega = await this.repository.findById(id);
    return bodega ? this.toEntry(bodega) : null;
  }

  async findPrincipal(): Promise<BodegaDirectoryEntry | null> {
    const bodega = await this.repository.findPrincipal();
    return bodega ? this.toEntry(bodega) : null;
  }

  private toEntry(bodega: {
    id?: number;
    codigo: string;
    nombre: string;
    activo: boolean;
    esPrincipal: boolean;
  }): BodegaDirectoryEntry {
    if (!bodega.id) throw new Error('La bodega persistida no tiene id.');
    return {
      id: bodega.id,
      codigo: bodega.codigo,
      nombre: bodega.nombre,
      activo: bodega.activo,
      esPrincipal: bodega.esPrincipal,
    };
  }
}

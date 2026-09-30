import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { BodegaCompanyContextInvalidError } from '../../domain/errors/bodega.errors';
import { BodegaCompanyContextPort } from '../../domain/ports/bodega-company-context.port';

@Injectable()
export class BodegaCompanyContextPrismaAdapter
  implements BodegaCompanyContextPort
{
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentCompanyId(): Promise<number> {
    const empresas = await this.prisma.empresa.findMany({
      select: { id: true },
      take: 2,
      orderBy: { id: 'asc' },
    });

    if (empresas.length !== 1) {
      throw new BodegaCompanyContextInvalidError(empresas.length);
    }

    return empresas[0].id;
  }
}

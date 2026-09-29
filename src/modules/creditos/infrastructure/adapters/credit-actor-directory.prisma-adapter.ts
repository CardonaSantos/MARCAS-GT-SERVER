import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { AppRole } from 'src/shared/security/roles.decorator';
import { CreditActorDirectoryPort } from '../../domain/ports/credit-actor-directory.port';
@Injectable()
export class CreditActorDirectoryPrismaAdapter implements CreditActorDirectoryPort{
 constructor(private readonly prisma:PrismaService){}
 async findById(id:number){const r=await this.prisma.usuario.findUnique({where:{id},select:{id:true,nombre:true,correo:true,rol:true,activo:true,empresaId:true}});return r?{...r,rol:r.rol as AppRole}:null;}
}

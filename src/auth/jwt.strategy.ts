import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService, private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'MySecretKey',
    });
  }

  /** Revalidar estado y rol contra BD: tokens antiguos no reactivan cuentas bloqueadas. */
  async validate(payload: { sub: number }) {
    const userId = Number(payload?.sub);
    if (!Number.isSafeInteger(userId) || userId < 1) throw new UnauthorizedException();
    const user = await this.users.findAuthUserById(userId);
    if (!user?.activo) throw new UnauthorizedException('Cuenta inactiva o inexistente.');
    return {
      userId: user.id, email: user.correo, name: user.nombre,
      rol: user.rol, empresaId: user.empresaId, activo: user.activo,
    };
  }
}

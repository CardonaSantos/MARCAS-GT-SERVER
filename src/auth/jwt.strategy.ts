import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'MySecretKey',
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      email: payload.correo,
      name: payload.nombre,
      rol: payload.rol,
      empresaId: payload.empresaId,
      activo: payload.activo,
    };
  }
}

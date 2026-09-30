import { Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { loginDTO } from './dto/login-auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateMyUser(loginDto: loginDTO) {
    const user = await this.userService.findByEmail(loginDto.correo);

    if (!user) {
      return null;
    }

    const passwordValid = await bcrypt.compare(
      loginDto.contrasena,
      user.contrasena,
    );

    if (!passwordValid) {
      return null;
    }

    return user;
  }

  async loginUser(usuario: {
    id: number;
    nombre: string;
    correo: string;
    rol: string;
    empresaId: number | null;
    activo: boolean;
  }) {
    const payload = {
      sub: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      empresaId: usuario.empresaId,
      activo: usuario.activo,
    };

    return {
      authToken: this.jwtService.sign(payload),

      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol,
        empresaId: usuario.empresaId,
        activo: usuario.activo,
      },
    };
  }
}

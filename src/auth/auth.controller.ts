import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';
import { loginDTO } from './dto/login-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: loginDTO) {
    const user = await this.authService.validateMyUser(dto);

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.authService.loginUser(user);
  }
}

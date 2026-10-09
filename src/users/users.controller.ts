import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
  Req, UseGuards, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserDirectoryQueryDto } from './dto/user-directory-query.dto';

type AuthenticatedRequest = { user: { userId: number } };

/** Todas las operaciones administrativas exigen JWT y un ADMIN activo validado en BD. */
@Controller('users')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(dto, Number(req.user.userId));
  }

  /** Contrato anterior para selectables: array de usuarios sin credenciales. */
  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.usersService.findAllUsers(Number(req.user.userId));
  }

  /** Catálogo de personal activo para asignaciones operativas (cualquier rol autenticado). */
  @Get('seleccionables')
  selectables(@Req() req: AuthenticatedRequest) {
    return this.usersService.findSelectables(Number(req.user.userId));
  }

  /** Nuevo contrato paginado, con filtros y totales reales. */
  @Get('directorio')
  directory(@Req() req: AuthenticatedRequest, @Query() query: UserDirectoryQueryDto) {
    return this.usersService.directory(Number(req.user.userId), query);
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOneUser(id, Number(req.user.userId));
  }

  @Patch('change-password/:id')
  changePassword(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changeUserPassword(id, dto, Number(req.user.userId));
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateOneUser(id, dto, Number(req.user.userId));
  }

  /** Conserva URL legacy, pero desactiva la cuenta para preservar auditoría. */
  @Delete(':id')
  deactivate(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.removeOneUser(id, Number(req.user.userId));
  }
}

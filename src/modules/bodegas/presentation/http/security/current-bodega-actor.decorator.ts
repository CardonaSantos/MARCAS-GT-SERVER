import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

export const CurrentBodegaActorId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): number => {
    const request = context.switchToHttp().getRequest();
    const userId = Number(request.user?.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('No se pudo identificar al usuario autenticado.');
    }

    return userId;
  },
);

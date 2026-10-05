import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from 'src/prisma.service';
import {
  TrackingRealtimePort,
  TrackingStateChangedPayload,
} from '../application/tracking-realtime.port';
import { TrackingRealtimeView } from '../application/tracking-query.port';

type TrackingSocket = Socket & {
  data: {
    user?: {
      id: number;
      rol: string;
    };
  };
};

@Injectable()
@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: '*' },
})
export class TrackingRealtimeGateway
  implements TrackingRealtimePort, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(TrackingRealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: TrackingSocket): Promise<void> {
    const token = this.extractToken(client);

    if (!token) {
      client.emit('error', { code: 'NO_TOKEN' });
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify<{ sub?: number; rol?: string }>(token);
      const userId = Number(payload.sub);

      if (!Number.isInteger(userId) || userId <= 0) {
        throw new Error('JWT sin sub válido.');
      }

      const user = await this.prisma.usuario.findUnique({
        where: { id: userId },
        select: { id: true, rol: true, activo: true },
      });

      if (!user?.activo) {
        throw new Error('Usuario inexistente o inactivo.');
      }

      client.data.user = { id: user.id, rol: user.rol };
      client.join('tracking:authenticated');
      client.join('user:' + user.id);
      client.join('role:' + user.rol);
    } catch (error) {
      this.logger.warn(
        'Conexión realtime rechazada: ' +
          (error instanceof Error ? error.message : String(error)),
      );
      client.emit('error', { code: 'INVALID_TOKEN' });
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: TrackingSocket): void {}

  async emitLocationUpdated(payload: TrackingRealtimeView): Promise<void> {
    this.server?.to('role:ADMIN').emit('tracking:location-updated', payload);
  }

  async emitTrackingStateChanged(
    payload: TrackingStateChangedPayload,
  ): Promise<void> {
    this.server?.to('role:ADMIN').emit('tracking:state-changed', payload);
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = (client.handshake.auth as any)?.token;

    if (typeof authToken === 'string' && authToken.trim()) {
      return this.normalizeToken(authToken);
    }

    const queryToken = client.handshake.query?.token;

    if (typeof queryToken === 'string' && queryToken.trim()) {
      return this.normalizeToken(queryToken);
    }

    const header = client.handshake.headers.authorization;

    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }

    return undefined;
  }

  private normalizeToken(value: string): string {
    return value.startsWith('Bearer ') ? value.slice(7) : value;
  }
}

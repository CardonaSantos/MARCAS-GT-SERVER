import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { LocationDto } from './dto/location.dto';
import { Server, Socket } from 'socket.io';
import { time } from 'console';
import { CreateLocationDto } from './dto/create-location.dto';
import { LocationService } from './location.service';
import { forwardRef, Inject } from '@nestjs/common';
import { ProspectoService } from 'src/prospecto/prospecto.service';
import { Cron, CronExpression } from '@nestjs/schedule';

// const allowedSocketOrigin = process.env.CORS_ORIGIN;
const allowedSocketOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000'; // Asegúrate de que esto incluya tu dominio real

interface location {
  latitud: number;
  longitud: number;
  usuarioId: number;
  prospectos: Prospectos;
}

enum Estado {
  EN_PROSPECTO = 'EN_PROSPECTO',
  FINALIZADO = 'FINALIZADO',
  CANCELADO = 'CANCELADO',
}

interface Prospectos {
  estado: Estado;
  inicio: string;
  nombreCompleto: string;
  apellido: string;
  empresaTienda: string;
}

//---------------------------------
@WebSocketGateway({
  cors: {
    // origin: allowedSocketOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
})
export class LocationGateway {
  @WebSocketServer()
  server: Server;

  private users: Map<number, string> = new Map();
  private employees: Map<number, string> = new Map();
  private admins: Map<number, string> = new Map();

  constructor(
    @Inject(forwardRef(() => LocationService))
    private readonly locationService: LocationService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  handleCron() {
    this.startBroadcastingConnectedUsers();
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  handleCronVerUsuariosConectados() {
    let x = this.getConnectedEmployees();
    // console.log('Los usuarios conectados, que son vendedores son: ', x);
  }

  startBroadcastingConnectedUsers() {
    const totalConnectedUsers = this.getTotalConnectedUsers();
    const totalEmployees = this.getConnectedEmployees();
    const totalAdmins = this.getConnectedAdmins();

    const data = {
      totalConnectedUsers,
      totalEmployees,
      totalAdmins,
    };

    this.admins.forEach((socketId) => {
      this.server.to(socketId).emit('updateConnectedUsers', data);
      // console.log('Emitiendo con CRON solo a admins...');
    });
  }

  // En tu Gateway de NestJS
  @SubscribeMessage('registerUser')
  handleRegisterUser(client: Socket, userId: number) {
    const role = client.handshake.query.role as string;

    // Eliminar registros antiguos del usuario
    this.employees.delete(userId);
    this.admins.delete(userId);

    // Registrar con el nuevo socketId
    if (role === 'ADMIN') {
      this.admins.set(userId, client.id);
    } else {
      this.employees.set(userId, client.id);
    }

    console.log(`[Re-registro] Usuario ${userId} -> Socket: ${client.id}`);
  }

  handleConnection(client: Socket) {
    const userId = this.getUserIdFromClient(client);
    const role = client.handshake.query.role as string;

    console.log(`Intentando conectar usuario ID: ${userId}, role: ${role}`);
    if (!isNaN(userId)) {
      if (role === 'ADMIN') {
        this.admins.set(userId, client.id);
      } else {
        // Asegúrate que el role es EMPLOYEE para los vendedores
        this.employees.set(userId, client.id);
      }

      console.log(`${role} conectado: ${client.id} Usuario ID: ${userId}`);
    } else {
      console.log(`Cliente conectado ${client.id} Usuario ID NaN`);
    }

    // this.updateAdmins(); // Notificar después de la conexión
  }

  //PARA EMITIR EVENTOS
  emitNotificationToAdmins(notificacion: any) {
    this.admins.forEach((socketId) => {
      this.server.to(socketId).emit('newNotification', notificacion);
    });
  }

  printConnectedEmployees() {
    console.log('Empleados conectados:', Array.from(this.employees.entries()));
  }

  // Método para emitir notificaciones a un empleado específico
  // emitNotificationToEmployee(employeeId: number, notification: any) {
  //   const socketId = this.employees.get(employeeId);

  //   console.log(
  //     'ENTRANDO AL GATEWAY DE NOTIFICACION DE SELLER===================>',
  //   );

  //   console.log(
  //     `Intentando emitir notificación al empleado ID: ${employeeId}, socketId: ${socketId}`,
  //   );

  //   this.printConnectedEmployees();

  //   if (socketId) {
  //     console.log(
  //       'Emitiendo la notificación: ',
  //       notification,
  //       'Para el empleado con id: ',
  //       employeeId,
  //     );

  //     this.server.to(socketId).emit('newNotificationToSeller', notification);
  //   } else {
  //     console.log(
  //       `No se encontró socketId para el empleado con id: ${employeeId}`,
  //     );
  //   }
  // }

  // emitNotificationToEmployee(employeeId: number, notification: any) {
  //   console.log('Enviando notifiacion a SELLERS..');
  //   this.employees.forEach((socketId) => {
  //     this.server.to(socketId).emit('newNotification', notification);
  //   });
  // }

  // emitNotificationToEmployee(employeeId: number, notification: any) {
  //   console.log(`Enviando notificación a empleado ${employeeId}...`);

  //   const socketId = this.employees.get(employeeId); // Obtener el socketId del usuario específico
  //   if (socketId) {
  //     this.server.to(socketId).emit('newNotification', notification);
  //   }
  // }
  //AHORA ENVIA A TODOS LOS USUARIOS, PERO COMO USAMOS LA FUNCION CON LOS EMPLOYEES, SOLO LOS ENVIA A ELLOS, EN EL FRONTEND FILTRAMOS, ASI QUE TODO GOOD :)
  emitNotificationToEmployee(employeeId: number, notification: any) {
    // console.log('Enviando notificación a TODOS los empleados...');

    this.employees.forEach((socketId) => {
      this.server.to(socketId).emit('newNotification', {
        ...notification,
        targetUserId: employeeId, // Agregamos el ID del usuario objetivo
      });
    });
  }

  // emitRejectNotificationToEmployee(employeeId: number, notification: any) {
  //   try {
  //     const socketId = this.employees.get(employeeId); //dame el socket id del empleado con el id que te estoy pasando

  //     console.log(
  //       `Intentando emitir notificación al empleado ID: ${employeeId}, socketId: ${socketId}`,
  //     );
  //     this.printConnectedEmployees();

  //     if (socketId) {
  //       console.log(
  //         'Emitiendo la notificación: ',
  //         notification,
  //         'Para el empleado con id: ',
  //         employeeId,
  //       );
  //     }

  //     this.server.to(socketId).emit('newNotificationToSeller', notification);
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }

  handleDisconnect(client: Socket) {
    const userId = this.getUserIdFromClient(client);
    const role = client.handshake.query.role as string;

    if (!isNaN(userId)) {
      if (role === 'ADMIN') {
        this.admins.delete(userId);
      } else {
        this.employees.delete(userId);
      }
      // console.log(`${role} desconectado: ${client.id} Usuario ID: ${userId}`);
    }

    // this.updateAdmins(); // Notificar después de la desconexión
  }

  /**
   * LEGACY TRACKING DESHABILITADO.
   *
   * Se conserva temporalmente el método porque LocationGateway todavía
   * contiene notificaciones/solicitudes comerciales heredadas, pero ya no
   * existe un SubscribeMessage para "sendLocation".
   *
   * El tracking oficial se recibe exclusivamente por
   * POST /real-time-location/tracking/location.
   */
  async handleSendLocationToAdmin(client: Socket, locationData: location) {
    // console.log('Ubicación recibida: ', locationData);

    // Intentar encontrar una ubicación existente para este usuario
    const existingLocation = await this.locationService.findLocationByUserId(
      locationData.usuarioId,
    );

    let locationToSend;

    if (existingLocation) {
      // Si existe, actualizar el registro
      await this.locationService.updateLocation(
        existingLocation.id,
        locationData,
      );

      // Asigna la información completa a locationToSend
      locationToSend = {
        ...existingLocation,
        latitud: existingLocation.latitud,
        longitud: existingLocation.longitud,
        usuario: {
          id: existingLocation.usuario.id,
          nombre: existingLocation.usuario.nombre,
          rol: existingLocation.usuario.rol,
          prospecto: existingLocation.usuario.prospectos[0] || null, // Incluye el prospecto
          asistencia: existingLocation.usuario.registrosAsistencia[0] || null, // Incluye la asistencia
          visita: existingLocation.usuario.visitas[0] || null, // Incluye la visita en curso
        },
      };
    } else {
      // Si no existe, crea una nueva ubicación
      const newLocation =
        await this.locationService.createLocation(locationData);
      const userInfo = await this.locationService.finUnique(
        Number(locationData.usuarioId),
      );

      // Asigna la información completa a locationToSend
      locationToSend = {
        ...newLocation,
        usuario: {
          id: locationData.usuarioId,
          nombre: userInfo?.nombre || 'Desconocido',
          rol: userInfo?.rol || 'Desconocido',
          prospecto: userInfo?.prospectos[0] || null,
          asistencia: userInfo?.registrosAsistencia[0] || null,
          visita: existingLocation.usuario.visitas[0] || null, // Incluye la visita en curso
        },
      };
    }

    // Enviar la ubicación con la información del usuario solo a los administradores conectados
    this.admins.forEach((socketId) => {
      if (this.server.sockets.sockets.get(socketId)) {
        this.server.to(socketId).emit('receiveLocation', locationToSend);
      }
    });
  }

  // private getUserIdFromClient(client: Socket): number {
  //   return parseInt(client.handshake.query.userId as string, 10);
  // }

  private getUserIdFromClient(client: Socket): number {
    const userId = client.handshake.query.userId as string;
    return parseInt(userId, 10); // Conversión robusta
  }

  @SubscribeMessage('requestDiscount')
  async handleRequestDiscount(
    client: Socket,
    requestData: {
      clienteId: number;
      justificacion: string;
      usuarioId: number;
      descuentoSolicitado: number;
      motivo: string;
    },
  ) {
    console.log('Evento requestDiscount recibido con los datos:', requestData);

    // Crear un registro de solicitud en la base de datos
    await this.locationService.createSolicitud(requestData);
    return;
  }

  //EMITIR EL REGISTRO A LOS ADMINS
  // Emitir el registro de la solicitud de descuento a los administradores
  emitDiscountRequestToAdmins(solicitudDescuento: any) {
    console.log(
      'Enviando solicitud de descuento a los administradores:',
      solicitudDescuento,
    );

    console.log('EMITIENDO EL REGISTRO');

    this.admins.forEach((socketId) => {
      this.server.to(socketId).emit('newDiscountRequest', solicitudDescuento);
    });
  }

  getTotalConnectedUsers(): number {
    return this.admins.size + this.employees.size;
  }

  getConnectedEmployees(): number {
    return this.employees.size;
  }

  getConnectedAdmins(): number {
    return this.admins.size;
  }
}

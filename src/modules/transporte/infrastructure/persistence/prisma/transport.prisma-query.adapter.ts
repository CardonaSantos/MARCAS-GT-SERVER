import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import {
  ShipmentCandidateFilters,
  ShipmentListFilters,
  TransportQueryPort,
  TransportReadScope,
} from '../../../application/ports/transport-query.port';
import {
  DriverState,
  ShipmentIncidentState,
  ShipmentMode,
  ShipmentState,
  VehicleState,
} from '../../../transport.types';

type TransportWarning = Readonly<{
  codigo:
    | 'SALIDA_ATRASADA'
    | 'INCIDENCIA_ABIERTA'
    | 'SIN_VEHICULO'
    | 'SIN_CONDUCTOR'
    | 'SIN_RESPONSABLE';
  nivel: 'ADVERTENCIA' | 'CRITICO';
  mensaje: string;
}>;

type WarningSource = Readonly<{
  estado: string;
  modalidad: string;
  salidaProgramadaEn?: Date | null;
  salidaEn?: Date | null;
  vehiculo?: unknown | null;
  conductor?: unknown | null;
  responsable?: unknown | null;
  incidencias?: readonly unknown[];
}>;

@Injectable()
export class TransportPrismaQueryAdapter implements TransportQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================================================
  // ENVÍO: ESTADO / LISTADO / DETALLE
  // ==========================================================================

  async findIdempotentOperation(key: string) {
    const event = await this.prisma.envioEvento.findUnique({
      where: {
        claveIdempotencia: key,
      },
      select: {
        envioId: true,
        tipo: true,
      },
    });

    return event
      ? {
          envioId: event.envioId,
          tipo: event.tipo,
        }
      : null;
  }

  async getShipmentState(id: number, scope: TransportReadScope) {
    const row = await this.prisma.envio.findFirst({
      where: {
        id,
        ...this.scopeWhere(scope),
      },
      select: {
        id: true,
        estado: true,
        modalidad: true,
        version: true,
        bodegaId: true,
        vehiculoId: true,
        conductorId: true,
        responsableId: true,
      },
    });

    if (!row) {
      return null;
    }

    return {
      ...row,
      estado: row.estado as ShipmentState,
      modalidad: row.modalidad as ShipmentMode,
    };
  }

  async listShipments(filters: ShipmentListFilters) {
    const where: Prisma.EnvioWhereInput = {
      ...this.scopeWhere(filters.scope),

      ...(filters.estado
        ? {
            estado: filters.estado,
          }
        : {}),

      ...(filters.modalidad
        ? {
            modalidad: filters.modalidad,
          }
        : {}),

      ...(filters.bodegaId
        ? {
            bodegaId: filters.bodegaId,
          }
        : {}),

      ...(filters.transportistaId
        ? {
            transportistaId: filters.transportistaId,
          }
        : {}),

      ...(filters.vehiculoId
        ? {
            vehiculoId: filters.vehiculoId,
          }
        : {}),

      ...(filters.conductorId
        ? {
            conductorId: filters.conductorId,
          }
        : {}),

      ...(filters.responsableId
        ? {
            responsableId: filters.responsableId,
          }
        : {}),

      ...(filters.clienteId
        ? {
            despachos: {
              some: {
                clienteId: filters.clienteId,
              },
            },
          }
        : {}),

      ...(filters.conIncidencia
        ? {
            incidencias: {
              some: {
                estado: {
                  not: 'RESUELTA',
                },
              },
            },
          }
        : {}),

      ...(filters.soloAtrasados
        ? {
            salidaProgramadaEn: {
              lt: new Date(),
            },
            salidaEn: null,
            estado: {
              notIn: ['COMPLETADO', 'CANCELADO'],
            },
          }
        : {}),

      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde
                ? {
                    gte: filters.fechaDesde,
                  }
                : {}),
              ...(filters.fechaHasta
                ? {
                    lte: filters.fechaHasta,
                  }
                : {}),
            },
          }
        : {}),

      ...(filters.search
        ? {
            OR: [
              {
                numero: {
                  contains: filters.search,
                  mode: 'insensitive',
                },
              },
              {
                guia: {
                  contains: filters.search,
                  mode: 'insensitive',
                },
              },
              {
                despachos: {
                  some: {
                    destinatario: {
                      contains: filters.search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const orderBy = {
      [filters.sortBy]: filters.sortDir,
    } as Prisma.EnvioOrderByWithRelationInput;

    const [rows, total] = await Promise.all([
      this.prisma.envio.findMany({
        where,
        orderBy,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        select: {
          id: true,
          numero: true,
          modalidad: true,
          estado: true,
          salidaProgramadaEn: true,
          entregaEstimadaEn: true,
          salidaEn: true,
          completadoEn: true,
          costo: true,
          creadoEn: true,
          actualizadoEn: true,

          bodega: {
            select: {
              id: true,
              codigo: true,
              nombre: true,
            },
          },

          transportista: {
            select: {
              id: true,
              nombre: true,
              tipo: true,
            },
          },

          vehiculo: {
            select: {
              id: true,
              placa: true,
              marca: true,
              modelo: true,
            },
          },

          conductor: {
            select: {
              id: true,
              nombre: true,
              telefono: true,
            },
          },

          responsable: {
            select: {
              id: true,
              nombre: true,
              rol: true,
            },
          },

          despachos: {
            select: {
              id: true,
              estado: true,
              cargas: {
                select: {
                  cantidadPlanificada: true,
                  cantidadCargada: true,
                },
              },
            },
          },

          incidencias: {
            where: {
              estado: {
                not: 'RESUELTA',
              },
            },
            select: {
              id: true,
            },
          },
        },
      }),

      this.prisma.envio.count({
        where,
      }),
    ]);

    return {
      data: rows.map((row) => {
        const loads = row.despachos.flatMap((dispatch) => dispatch.cargas);

        return {
          ...row,

          costo: row.costo != null ? String(row.costo) : null,

          progreso: {
            paradas: row.despachos.length,

            paradasAtendidas: row.despachos.filter(
              (dispatch) => dispatch.estado === 'ATENDIDA',
            ).length,

            unidadesPlanificadas: loads.reduce(
              (totalUnits, load) => totalUnits + load.cantidadPlanificada,
              0,
            ),

            unidadesCargadas: loads.reduce(
              (totalUnits, load) => totalUnits + load.cantidadCargada,
              0,
            ),
          },

          incidenciasAbiertas: row.incidencias.length,

          advertencias: this.listWarnings(row),
        };
      }),

      meta: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  async getShipment(id: number, scope: TransportReadScope) {
    const row = await this.prisma.envio.findFirst({
      where: {
        id,
        ...this.scopeWhere(scope),
      },

      include: {
        bodega: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            direccion: true,
          },
        },

        transportista: true,
        vehiculo: true,
        conductor: true,

        responsable: {
          select: {
            id: true,
            nombre: true,
            correo: true,
            rol: true,
            activo: true,
          },
        },

        creadoPor: {
          select: {
            id: true,
            nombre: true,
            rol: true,
          },
        },

        asignadoPor: {
          select: {
            id: true,
            nombre: true,
            rol: true,
          },
        },

        cargaConfirmadaPor: {
          select: {
            id: true,
            nombre: true,
            rol: true,
          },
        },

        iniciadoPor: {
          select: {
            id: true,
            nombre: true,
            rol: true,
          },
        },

        completadoPor: {
          select: {
            id: true,
            nombre: true,
            rol: true,
          },
        },

        canceladoPor: {
          select: {
            id: true,
            nombre: true,
            rol: true,
          },
        },

        despachos: {
          orderBy: {
            secuencia: 'asc',
          },

          include: {
            cliente: {
              select: {
                id: true,
                nombre: true,
                apellido: true,
                telefono: true,
              },
            },

            ordenDespacho: {
              select: {
                id: true,
                numero: true,
                estado: true,

                pedido: {
                  select: {
                    id: true,
                    numero: true,

                    vendedor: {
                      select: {
                        id: true,
                        nombre: true,
                      },
                    },
                  },
                },
              },
            },

            cargas: {
              include: {
                producto: {
                  select: {
                    id: true,
                    codigoProducto: true,
                    nombre: true,
                  },
                },
              },

              orderBy: {
                id: 'asc',
              },
            },

            entrega: {
              select: {
                id: true,
                estado: true,
                entregadoEn: true,
              },
            },
          },
        },

        eventos: {
          orderBy: {
            creadoEn: 'desc',
          },
          take: 10,

          include: {
            usuario: {
              select: {
                id: true,
                nombre: true,
                rol: true,
              },
            },
          },
        },

        incidencias: {
          orderBy: {
            reportadaEn: 'desc',
          },
          take: 10,

          include: {
            reportadaPor: {
              select: {
                id: true,
                nombre: true,
              },
            },

            resueltaPor: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
      },
    });

    if (!row) {
      return null;
    }

    const loads = row.despachos.flatMap((dispatch) => dispatch.cargas);

    return {
      ...row,

      costo: row.costo != null ? String(row.costo) : null,

      paradas: row.despachos.map((stop) => ({
        id: stop.id,
        estado: stop.estado,
        secuencia: stop.secuencia,

        destino: {
          destinatario: stop.destinatario,

          telefono: stop.telefonoDestino,

          direccion: stop.direccionDestino,

          latitud:
            stop.latitudDestino != null ? Number(stop.latitudDestino) : null,

          longitud:
            stop.longitudDestino != null ? Number(stop.longitudDestino) : null,
        },

        cliente: stop.cliente,

        ordenDespacho: stop.ordenDespacho,

        cargas: stop.cargas.map((load) => ({
          id: load.id,

          ordenDespachoDetalleId: load.ordenDespachoDetalleId,

          producto: load.producto,

          cantidadPlanificada: load.cantidadPlanificada,

          cantidadCargada: load.cantidadCargada,

          pendienteCargar: Math.max(
            0,
            load.cantidadPlanificada - load.cantidadCargada,
          ),

          version: load.version,
        })),

        entrega: stop.entrega,
      })),

      progreso: {
        paradas: row.despachos.length,

        paradasAtendidas: row.despachos.filter(
          (stop) => stop.estado === 'ATENDIDA',
        ).length,

        unidadesPlanificadas: loads.reduce(
          (totalUnits, load) => totalUnits + load.cantidadPlanificada,
          0,
        ),

        unidadesCargadas: loads.reduce(
          (totalUnits, load) => totalUnits + load.cantidadCargada,
          0,
        ),
      },

      advertencias: this.listWarnings(row),

      acciones: this.actions(row.estado as ShipmentState, scope),
    };
  }

  // ==========================================================================
  // CANDIDATOS LOGÍSTICOS
  // ==========================================================================

  async listCandidates(filters: ShipmentCandidateFilters) {
    const where: Prisma.OrdenDespachoWhereInput = {
      estado: {
        in: ['PREPARADA', 'PARCIALMENTE_DESPACHADA', 'DESPACHADA'],
      },

      pedido: {
        empresaId: filters.scope.empresaId,

        ...(filters.scope.vendedorId
          ? {
              vendedorId: filters.scope.vendedorId,
            }
          : {}),

        ...(filters.clienteId
          ? {
              clienteId: filters.clienteId,
            }
          : {}),
      },

      ...(filters.bodegaId
        ? {
            bodegaId: filters.bodegaId,
          }
        : {}),

      ...(filters.search
        ? {
            OR: [
              {
                numero: {
                  contains: filters.search,
                  mode: 'insensitive',
                },
              },

              {
                pedido: {
                  numero: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              },

              {
                pedido: {
                  cliente: {
                    nombre: {
                      contains: filters.search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.ordenDespacho.findMany({
        where,

        orderBy: {
          creadoEn: 'asc',
        },

        skip: (filters.page - 1) * filters.limit,

        take: filters.limit,

        include: {
          bodega: {
            select: {
              id: true,
              codigo: true,
              nombre: true,
            },
          },

          pedido: {
            select: {
              id: true,
              numero: true,

              vendedor: {
                select: {
                  id: true,
                  nombre: true,
                },
              },

              cliente: {
                select: {
                  id: true,
                  nombre: true,
                  apellido: true,
                  telefono: true,
                  direccion: true,
                },
              },
            },
          },

          detalles: {
            include: {
              producto: {
                select: {
                  id: true,
                  codigoProducto: true,
                  nombre: true,
                },
              },

              cargasEnvio: {
                where: {
                  envioDespacho: {
                    envio: {
                      estado: {
                        not: 'CANCELADO',
                      },
                    },
                  },
                },

                select: {
                  cantidadPlanificada: true,
                  cantidadCargada: true,
                },
              },
            },
          },
        },
      }),

      this.prisma.ordenDespacho.count({
        where,
      }),
    ]);

    const data = rows
      .map((row) => ({
        despacho: {
          id: row.id,
          numero: row.numero,
          estado: row.estado,
          bodega: row.bodega,

          pedido: {
            id: row.pedido.id,
            numero: row.pedido.numero,
            vendedor: row.pedido.vendedor,
          },

          cliente: row.pedido.cliente,
        },

        lineas: row.detalles.map((detail) => {
          const cantidadYaPlanificada = detail.cargasEnvio.reduce(
            (totalUnits, load) => totalUnits + load.cantidadPlanificada,
            0,
          );

          const cantidadYaCargada = detail.cargasEnvio.reduce(
            (totalUnits, load) => totalUnits + load.cantidadCargada,
            0,
          );

          return {
            ordenDespachoDetalleId: detail.id,

            producto: detail.producto,

            cantidadPreparada: detail.cantidadPreparada,

            cantidadDespachada: detail.cantidadDespachada,

            cantidadYaPlanificada,

            cantidadYaCargada,

            cantidadPlanificable: Math.max(
              0,
              detail.cantidadPreparada - cantidadYaPlanificada,
            ),

            cantidadCargable: Math.max(
              0,
              detail.cantidadDespachada - cantidadYaCargada,
            ),
          };
        }),
      }))
      .filter((candidate) =>
        candidate.lineas.some((line) => line.cantidadPlanificable > 0),
      );

    return {
      data,

      meta: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  // ==========================================================================
  // EVENTOS / INCIDENCIAS
  // ==========================================================================

  async listEvents(
    id: number,
    scope: TransportReadScope,
    page: number,
    limit: number,
  ) {
    const shipment = await this.getShipmentState(id, scope);

    if (!shipment) {
      return this.emptyPage(page, limit);
    }

    const [data, total] = await Promise.all([
      this.prisma.envioEvento.findMany({
        where: {
          envioId: id,
        },

        orderBy: {
          creadoEn: 'desc',
        },

        skip: (page - 1) * limit,

        take: limit,

        include: {
          usuario: {
            select: {
              id: true,
              nombre: true,
              rol: true,
            },
          },
        },
      }),

      this.prisma.envioEvento.count({
        where: {
          envioId: id,
        },
      }),
    ]);

    return {
      data,

      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listIncidents(
    id: number,
    scope: TransportReadScope,
    page: number,
    limit: number,
    estado?: ShipmentIncidentState,
  ) {
    const shipment = await this.getShipmentState(id, scope);

    if (!shipment) {
      return this.emptyPage(page, limit);
    }

    const where: Prisma.EnvioIncidenciaWhereInput = {
      envioId: id,

      ...(estado
        ? {
            estado,
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.envioIncidencia.findMany({
        where,

        orderBy: {
          reportadaEn: 'desc',
        },

        skip: (page - 1) * limit,

        take: limit,

        include: {
          reportadaPor: {
            select: {
              id: true,
              nombre: true,
            },
          },

          resueltaPor: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
      }),

      this.prisma.envioIncidencia.count({
        where,
      }),
    ]);

    return {
      data,

      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==========================================================================
  // RESUMEN / REPORTERÍA
  // ==========================================================================

  async getSummary(
    scope: TransportReadScope,
    filters: {
      bodegaId?: number;
      fechaDesde?: Date;
      fechaHasta?: Date;
    } = {},
  ) {
    const where: Prisma.EnvioWhereInput = {
      ...this.scopeWhere(scope),

      ...(filters.bodegaId
        ? {
            bodegaId: filters.bodegaId,
          }
        : {}),

      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde
                ? {
                    gte: filters.fechaDesde,
                  }
                : {}),

              ...(filters.fechaHasta
                ? {
                    lte: filters.fechaHasta,
                  }
                : {}),
            },
          }
        : {}),
    };

    const [total, grouped, loads, openIncidents, externalCost] =
      await Promise.all([
        this.prisma.envio.count({
          where,
        }),

        this.prisma.envio.groupBy({
          by: ['estado'],
          where,
          _count: {
            _all: true,
          },
        }),

        this.prisma.envioCargaDetalle.aggregate({
          where: {
            envioDespacho: {
              envio: where,
            },
          },

          _sum: {
            cantidadPlanificada: true,
            cantidadCargada: true,
          },
        }),

        this.prisma.envioIncidencia.count({
          where: {
            envio: where,
            estado: {
              not: 'RESUELTA',
            },
          },
        }),

        this.prisma.envio.aggregate({
          where: {
            ...where,
            modalidad: 'EXTERNO',
          },

          _sum: {
            costo: true,
          },
        }),
      ]);

    const porEstado = Object.fromEntries(
      grouped.map((group) => [group.estado, group._count._all]),
    ) as Partial<Record<ShipmentState, number>>;

    return {
      total,

      porEstado,

      abiertas:
        total - (porEstado.COMPLETADO ?? 0) - (porEstado.CANCELADO ?? 0),

      unidades: {
        planificadas: loads._sum.cantidadPlanificada ?? 0,

        cargadas: loads._sum.cantidadCargada ?? 0,
      },

      incidenciasAbiertas: openIncidents,

      costoExterno: String(externalCost._sum.costo ?? 0),
    };
  }

  async getOperationalReport(
    scope: TransportReadScope,
    filters: {
      bodegaId?: number;
      fechaDesde?: Date;
      fechaHasta?: Date;
    } = {},
  ) {
    const where: Prisma.EnvioWhereInput = {
      ...this.scopeWhere(scope),

      ...(filters.bodegaId
        ? {
            bodegaId: filters.bodegaId,
          }
        : {}),

      ...(filters.fechaDesde || filters.fechaHasta
        ? {
            creadoEn: {
              ...(filters.fechaDesde
                ? {
                    gte: filters.fechaDesde,
                  }
                : {}),

              ...(filters.fechaHasta
                ? {
                    lte: filters.fechaHasta,
                  }
                : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.envio.findMany({
      where,

      select: {
        id: true,
        modalidad: true,
        estado: true,

        creadoEn: true,
        asignadoEn: true,
        cargaConfirmadaEn: true,
        salidaProgramadaEn: true,
        salidaEn: true,
        completadoEn: true,

        costo: true,

        bodega: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
          },
        },

        transportista: {
          select: {
            id: true,
            nombre: true,
          },
        },

        vehiculo: {
          select: {
            id: true,
            placa: true,
          },
        },

        conductor: {
          select: {
            id: true,
            nombre: true,
          },
        },

        incidencias: {
          select: {
            tipo: true,
            severidad: true,
            estado: true,
          },
        },
      },
    });

    const completed = rows.filter((row) => row.estado === 'COMPLETADO');

    const punctual = rows.filter(
      (row) => row.salidaProgramadaEn && row.salidaEn,
    );

    const onTime = punctual.filter(
      (row) => row.salidaEn! <= row.salidaProgramadaEn!,
    ).length;

    return {
      totalEnvios: rows.length,

      modalidad: {
        internos: rows.filter((row) => row.modalidad === 'INTERNO').length,

        externos: rows.filter((row) => row.modalidad === 'EXTERNO').length,
      },

      puntualidadSalida: {
        evaluados: punctual.length,

        aTiempo: onTime,

        tarde: punctual.length - onTime,

        porcentajeATiempo: punctual.length
          ? Math.round((onTime / punctual.length) * 10000) / 100
          : 0,
      },

      tiemposPromedioHoras: {
        creacionAAsignacion: this.averageHours(
          rows.map((row) => [row.creadoEn, row.asignadoEn]),
        ),

        asignacionACarga: this.averageHours(
          rows.map((row) => [row.asignadoEn, row.cargaConfirmadaEn]),
        ),

        cargaASalida: this.averageHours(
          rows.map((row) => [row.cargaConfirmadaEn, row.salidaEn]),
        ),

        duracionRuta: this.averageHours(
          completed.map((row) => [row.salidaEn, row.completadoEn]),
        ),
      },

      incidencias: {
        total: rows.reduce(
          (totalIncidents, row) => totalIncidents + row.incidencias.length,
          0,
        ),

        abiertas: rows.reduce(
          (totalIncidents, row) =>
            totalIncidents +
            row.incidencias.filter((incident) => incident.estado !== 'RESUELTA')
              .length,
          0,
        ),
      },

      costoExterno: String(
        rows
          .filter((row) => row.modalidad === 'EXTERNO')
          .reduce((totalCost, row) => totalCost + Number(row.costo ?? 0), 0),
      ),
    };
  }

  // ==========================================================================
  // CATÁLOGOS
  // ==========================================================================

  async listCarriers(
    scope: TransportReadScope,
    filters: {
      search?: string;
      activo?: boolean;
      tipo?: ShipmentMode;
    },
  ) {
    return this.prisma.transportista.findMany({
      where: {
        empresaId: scope.empresaId,

        ...(filters.activo !== undefined
          ? {
              activo: filters.activo,
            }
          : {}),

        ...(filters.tipo
          ? {
              tipo: filters.tipo,
            }
          : {}),

        ...(filters.search
          ? {
              nombre: {
                contains: filters.search,
                mode: 'insensitive',
              },
            }
          : {}),
      },

      orderBy: [
        {
          activo: 'desc',
        },
        {
          nombre: 'asc',
        },
      ],
    });
  }

  async listVehicles(
    scope: TransportReadScope,
    filters: {
      search?: string;
      activo?: boolean;
      estado?: VehicleState;
    },
  ) {
    return this.prisma.vehiculo.findMany({
      where: {
        empresaId: scope.empresaId,

        ...(filters.activo !== undefined
          ? {
              activo: filters.activo,
            }
          : {}),

        ...(filters.estado
          ? {
              estado: filters.estado,
            }
          : {}),

        ...(filters.search
          ? {
              OR: [
                {
                  placa: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },

                {
                  marca: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },

                {
                  modelo: {
                    contains: filters.search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },

      orderBy: [
        {
          activo: 'desc',
        },
        {
          placa: 'asc',
        },
      ],

      include: {
        transportista: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });
  }

  async listDrivers(
    scope: TransportReadScope,
    filters: {
      search?: string;
      activo?: boolean;
      estado?: DriverState;
    },
  ) {
    return this.prisma.conductor.findMany({
      where: {
        empresaId: scope.empresaId,

        ...(filters.activo !== undefined
          ? {
              activo: filters.activo,
            }
          : {}),

        ...(filters.estado
          ? {
              estado: filters.estado,
            }
          : {}),

        ...(filters.search
          ? {
              nombre: {
                contains: filters.search,
                mode: 'insensitive',
              },
            }
          : {}),
      },

      orderBy: [
        {
          activo: 'desc',
        },
        {
          nombre: 'asc',
        },
      ],

      include: {
        transportista: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });
  }

  // ==========================================================================
  // HELPERS PRIVADOS
  // ==========================================================================

  private scopeWhere(scope: TransportReadScope): Prisma.EnvioWhereInput {
    return {
      empresaId: scope.empresaId,

      ...(scope.responsableId
        ? {
            responsableId: scope.responsableId,
          }
        : {}),

      ...(scope.vendedorId
        ? {
            despachos: {
              some: {
                ordenDespacho: {
                  pedido: {
                    vendedorId: scope.vendedorId,
                  },
                },
              },
            },
          }
        : {}),
    };
  }

  private listWarnings(row: WarningSource): TransportWarning[] {
    const warnings: TransportWarning[] = [];

    if (
      row.salidaProgramadaEn &&
      !row.salidaEn &&
      row.salidaProgramadaEn < new Date() &&
      !['COMPLETADO', 'CANCELADO'].includes(row.estado)
    ) {
      warnings.push({
        codigo: 'SALIDA_ATRASADA',
        nivel: 'ADVERTENCIA',
        mensaje: 'La salida programada ya venció.',
      });
    }

    if ((row.incidencias?.length ?? 0) > 0) {
      warnings.push({
        codigo: 'INCIDENCIA_ABIERTA',
        nivel: 'CRITICO',
        mensaje: 'El envío tiene incidencias abiertas.',
      });
    }

    if (row.modalidad === 'INTERNO' && row.estado === 'ASIGNADO') {
      if (!row.vehiculo) {
        warnings.push({
          codigo: 'SIN_VEHICULO',
          nivel: 'CRITICO',
          mensaje: 'No hay vehículo asignado.',
        });
      }

      if (!row.conductor) {
        warnings.push({
          codigo: 'SIN_CONDUCTOR',
          nivel: 'CRITICO',
          mensaje: 'No hay conductor asignado.',
        });
      }

      if (!row.responsable) {
        warnings.push({
          codigo: 'SIN_RESPONSABLE',
          nivel: 'CRITICO',
          mensaje: 'No hay responsable asignado.',
        });
      }
    }

    return warnings;
  }

  private actions(state: ShipmentState, scope: TransportReadScope) {
    const isPlanner = ['ADMIN', 'BODEGA'].includes(scope.rol);

    const isRouteOperator = isPlanner || scope.rol === 'REPARTIDOR';

    return {
      puedeEditar: isPlanner && state === 'PROGRAMADO',

      puedeAsignar: isPlanner && state === 'PROGRAMADO',

      puedeConfirmarCarga: isPlanner && state === 'ASIGNADO',

      puedeIniciarRuta: isRouteOperator && state === 'CARGADO',

      puedeCancelar: isPlanner && ['PROGRAMADO', 'ASIGNADO'].includes(state),

      puedeReportarIncidencia:
        isRouteOperator &&
        ['EN_RUTA', 'ENTREGADO_PARCIAL', 'INCIDENCIA'].includes(state),

      puedeAgregarObservacion: state !== 'CANCELADO',
    };
  }

  private averageHours(
    pairs: ReadonlyArray<readonly [Date | null, Date | null]>,
  ): number | null {
    const values = pairs
      .filter(
        (pair): pair is readonly [Date, Date] =>
          pair[0] instanceof Date && pair[1] instanceof Date,
      )
      .map(([from, to]) => (to.getTime() - from.getTime()) / 3_600_000);

    if (!values.length) {
      return null;
    }

    const average =
      values.reduce((total, value) => total + value, 0) / values.length;

    return Math.round(average * 100) / 100;
  }

  private emptyPage(page: number, limit: number) {
    return {
      data: [],
      meta: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
    };
  }
}

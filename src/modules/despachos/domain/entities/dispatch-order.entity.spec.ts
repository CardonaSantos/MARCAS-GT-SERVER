import {
  DispatchInvalidStateError,
  DispatchQuantityExceededError,
  DispatchValidationError,
} from '../errors/dispatch.errors';
import { OrdenDespacho } from './dispatch-order.entity';

const build = () =>
  OrdenDespacho.create({
    pedidoId: 10,
    bodegaId: 2,
    creadoPorId: 1,
    programadoEn: new Date('2026-10-01T15:00:00.000Z'),
    detalles: [
      {
        id: 101,
        pedidoDetalleId: 21,
        productoId: 31,
        cantidadProgramada: 10,
      },
      {
        id: 102,
        pedidoDetalleId: 22,
        productoId: 32,
        cantidadProgramada: 5,
      },
    ],
  });

describe('OrdenDespacho', () => {
  it('crea una orden pendiente con cantidades iniciales en cero', () => {
    const dispatch = build();

    expect(dispatch.estado).toBe('PENDIENTE');
    expect(dispatch.detalles[0].cantidadPreparada).toBe(0);
    expect(dispatch.detalles[0].cantidadDespachada).toBe(0);
  });

  it('rechaza cantidades programadas inválidas', () => {
    expect(() =>
      OrdenDespacho.create({
        pedidoId: 10,
        bodegaId: 2,
        creadoPorId: 1,
        detalles: [
          {
            pedidoDetalleId: 21,
            productoId: 31,
            cantidadProgramada: 0,
          },
        ],
      }),
    ).toThrow(DispatchValidationError);
  });

  it('controla el workflow de preparación', () => {
    const dispatch = build();

    dispatch.markPreparationStarted(
      new Date('2026-10-01T12:00:00.000Z'),
    );

    dispatch.updatePreparation([
      { detalleId: 101, cantidadPreparada: 10 },
      { detalleId: 102, cantidadPreparada: 5 },
    ]);

    dispatch.markPrepared(
      7,
      new Date('2026-10-01T13:00:00.000Z'),
    );

    expect(dispatch.estado).toBe('PREPARADA');
    expect(dispatch.preparadoPorId).toBe(7);
  });

  it('no finaliza preparación incompleta', () => {
    const dispatch = build();
    dispatch.markPreparationStarted();

    dispatch.updatePreparation([
      { detalleId: 101, cantidadPreparada: 10 },
    ]);

    expect(() => dispatch.markPrepared(7)).toThrow(
      DispatchValidationError,
    );
  });

  it('no permite preparar más de lo programado', () => {
    const dispatch = build();
    dispatch.markPreparationStarted();

    expect(() =>
      dispatch.updatePreparation([
        { detalleId: 101, cantidadPreparada: 11 },
      ]),
    ).toThrow(DispatchQuantityExceededError);
  });

  it('no permite cancelar desde un estado inválido', () => {
    const dispatch = OrdenDespacho.rehydrate({
      id: 1,
      pedidoId: 10,
      bodegaId: 2,
      estado: 'PARCIALMENTE_DESPACHADA',
      version: 3,
      detalles: [
        {
          id: 101,
          pedidoDetalleId: 21,
          productoId: 31,
          cantidadProgramada: 10,
          cantidadPreparada: 10,
          cantidadDespachada: 2,
        },
      ],
    });

    expect(() =>
      dispatch.cancel('No debe cancelarse', 1),
    ).toThrow(DispatchInvalidStateError);
  });
});

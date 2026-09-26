import { InventoryReservationClosedError } from '../errors/inventory.errors';
import { ReservaInventario } from './reserva-inventario.entity';

describe('ReservaInventario', () => {
  it('soporta aplicación parcial y cierre mixto', () => {
    const reservation = ReservaInventario.create(20, 30, 10);

    reservation.apply(4, new Date('2026-09-26T10:00:00Z'));

    expect(reservation.cantidadOriginal).toBe(10);
    expect(reservation.cantidadPendiente).toBe(6);
    expect(reservation.cantidadAplicada).toBe(4);
    expect(reservation.cantidadLiberada).toBe(0);
    expect(reservation.estado).toBe('PARCIAL');

    reservation.release(6, new Date('2026-09-26T11:00:00Z'));

    expect(reservation.cantidadPendiente).toBe(0);
    expect(reservation.cantidadAplicada).toBe(4);
    expect(reservation.cantidadLiberada).toBe(6);
    expect(reservation.estado).toBe('FINALIZADA_MIXTA');
    expect(reservation.cerradaEn).toEqual(
      new Date('2026-09-26T11:00:00Z'),
    );
  });

  it('al cancelar libera exactamente lo pendiente', () => {
    const reservation = ReservaInventario.create(20, 30, 10);
    reservation.apply(3);

    const released = reservation.cancel();

    expect(released).toBe(7);
    expect(reservation.cantidadOriginal).toBe(10);
    expect(reservation.cantidadAplicada).toBe(3);
    expect(reservation.cantidadLiberada).toBe(7);
    expect(reservation.cantidadPendiente).toBe(0);
    expect(reservation.estado).toBe('FINALIZADA_MIXTA');
  });

  it('no permite modificar una reserva cerrada', () => {
    const reservation = ReservaInventario.create(20, 30, 5);
    reservation.apply(5);

    expect(() => reservation.release(1)).toThrow(
      InventoryReservationClosedError,
    );
  });
});

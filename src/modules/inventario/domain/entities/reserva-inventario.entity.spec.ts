import { InventoryReservationClosedError } from '../errors/inventory.errors';
import { ReservaInventario } from './reserva-inventario.entity';

describe('ReservaInventario', () => {
  it('soporta aplicación parcial y cierre mixto', () => {
    const reservation = ReservaInventario.create(20, 30, 10);

    reservation.apply(4, new Date('2026-09-26T10:00:00Z'));
    reservation.release(6, new Date('2026-09-26T11:00:00Z'));

    expect(reservation.cantidadPendiente).toBe(0);
    expect(reservation.cantidadAplicada).toBe(4);
    expect(reservation.cantidadLiberada).toBe(6);
    expect(reservation.estado).toBe('FINALIZADA_MIXTA');
  });

  it('mantiene cerradas apply/release directas', () => {
    const reservation = ReservaInventario.create(20, 30, 5);
    reservation.apply(5);

    expect(() => reservation.release(1)).toThrow(
      InventoryReservationClosedError,
    );
  });

  it('reabre una reserva aplicada para otro despacho parcial', () => {
    const reservation = ReservaInventario.create(20, 30, 5);
    reservation.apply(5, new Date('2026-09-30T10:00:00Z'));

    reservation.increase(3);

    expect(reservation.cantidadOriginal).toBe(8);
    expect(reservation.cantidadAplicada).toBe(5);
    expect(reservation.cantidadPendiente).toBe(3);
    expect(reservation.estado).toBe('PARCIAL');
    expect(reservation.cerradaEn).toBeNull();

    reservation.apply(
      3,
      new Date('2026-09-30T11:00:00Z'),
    );

    expect(reservation.cantidadPendiente).toBe(0);
    expect(reservation.cantidadAplicada).toBe(8);
    expect(reservation.estado).toBe('APLICADA');
  });

  it('reabre una reserva liberada para una planificación posterior', () => {
    const reservation = ReservaInventario.create(20, 30, 4);
    reservation.release(4);

    reservation.increase(2);

    expect(reservation.cantidadOriginal).toBe(6);
    expect(reservation.cantidadLiberada).toBe(4);
    expect(reservation.cantidadPendiente).toBe(2);
    expect(reservation.estado).toBe('PARCIAL');
    expect(reservation.cerradaEn).toBeNull();
  });
});

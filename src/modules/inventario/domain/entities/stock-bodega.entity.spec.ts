import { InsufficientAvailableStockError } from '../errors/inventory.errors';
import { InventoryCost } from '../value-objects/inventory-cost.vo';
import { StockBodega } from './stock-bodega.entity';

describe('StockBodega', () => {
  it('mantiene disponible = real - reservado durante el ciclo de reserva', () => {
    const stock = StockBodega.create(1, 10);

    stock.registerEntry(20, InventoryCost.from('50.0000'));
    stock.reserve(7);

    expect(stock.snapshot()).toEqual({
      cantidadReal: 20,
      cantidadReservada: 7,
      cantidadDisponible: 13,
      costoPromedio: '50.0000',
    });

    stock.applyReservedExit(4);

    expect(stock.snapshot()).toEqual({
      cantidadReal: 16,
      cantidadReservada: 3,
      cantidadDisponible: 13,
      costoPromedio: '50.0000',
    });

    stock.releaseReservation(3);

    expect(stock.snapshot()).toEqual({
      cantidadReal: 16,
      cantidadReservada: 0,
      cantidadDisponible: 16,
      costoPromedio: '50.0000',
    });
  });

  it('calcula costo promedio ponderado con cuatro decimales', () => {
    const stock = StockBodega.create(1, 10);

    stock.registerEntry(10, InventoryCost.from('50'));
    stock.registerEntry(10, InventoryCost.from('60'));

    expect(stock.cantidadReal).toBe(20);
    expect(stock.costoPromedio.toString()).toBe('55.0000');
  });

  it('rechaza reservar más de la disponibilidad', () => {
    const stock = StockBodega.create(1, 10);
    stock.registerEntry(5, InventoryCost.from('10'));

    expect(() => stock.reserve(6)).toThrow(InsufficientAvailableStockError);
  });
});

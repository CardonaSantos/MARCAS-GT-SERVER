import { CreateInvoiceFromDeliveriesUseCase } from './create-invoice-from-deliveries.use-case';

describe('CreateInvoiceFromDeliveriesUseCase', () => {
  const actors: any = {
    findById: jest.fn().mockResolvedValue({
      id: 1,
      nombre: 'Admin',
      correo: 'admin@test.local',
      rol: 'ADMIN',
      activo: true,
      empresaId: 10,
    }),
  };

  const deliveries: any = {
    findBillableById: jest.fn().mockResolvedValue({
      id: 50,
      estado: 'ENTREGADA',
      empresaId: 10,
      pedidoId: 20,
      clienteId: 30,
      ordenDespachoId: 40,
      envioDespachoId: 60,
      entregadoEn: new Date(),
      finalizadaEn: new Date(),
      detalles: [
        {
          id: 501,
          pedidoDetalleId: 201,
          productoId: 301,
          cantidadEntregada: 5,
          cantidadRechazada: 0,
        },
      ],
    }),
  };

  const orders: any = {
    findForBilling: jest.fn().mockResolvedValue({
      id: 20,
      numero: 'PED-20',
      empresaId: 10,
      clienteId: 30,
      vendedorId: 2,
      estado: 'ENTREGADO',
      condicionPago: 'CREDITO',
      estadoPago: 'PENDIENTE',
      moneda: 'GTQ',
      subtotal: '1000.00',
      descuentoTotal: '100.00',
      total: '900.00',
      detalles: [
        {
          id: 201,
          productoId: 301,
          cantidadSolicitada: 10,
          cantidadDespachada: 10,
          cantidadEntregada: 5,
          precioUnitario: '100.00',
          descuento: '100.00',
          subtotal: '900.00',
        },
      ],
    }),
  };

  const products: any = {
    findByIds: jest.fn().mockResolvedValue([
      {
        id: 301,
        codigo: 'P-1',
        nombre: 'Producto 1',
        descripcion: null,
        fiscal: {
          activo: true,
          bienOServicio: 'BIEN',
          unidadMedida: 'UN',
          descripcionFiscal: 'Producto fiscal',
          nombreCortoImpuesto: 'IVA',
          codigoUnidadGravable: 1,
        },
      },
    ]),
  };

  it('construye el draft desde cantidades realmente entregadas', async () => {
    const repository: any = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createDraft: jest.fn().mockImplementation(async (input) => ({
        id: 700,
        empresaId: input.empresaId,
        clienteId: input.clienteId,
      })),
    };

    const useCase = new CreateInvoiceFromDeliveriesUseCase(
      repository,
      actors,
      deliveries,
      orders,
      products,
    );

    const result = await useCase.execute({
      entregaIds: [50],
      lineas: [{ entregaDetalleId: 501, cantidad: 5 }],
      claveIdempotencia: 'invoice-test-001',
      actorId: 1,
    });

    expect(result.id).toBe(700);
    expect(repository.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 10,
        clienteId: 30,
        pedidoId: 20,
        lineas: [
          expect.objectContaining({
            entregaDetalleId: 501,
            cantidad: 5,
            precioUnitario: '100.00',
            descuentoTotalPedido: '100.00',
          }),
        ],
      }),
    );
  });

  it('rechaza cantidades mayores a la entrega', async () => {
    const repository: any = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createDraft: jest.fn(),
    };

    const useCase = new CreateInvoiceFromDeliveriesUseCase(
      repository,
      actors,
      deliveries,
      orders,
      products,
    );

    await expect(
      useCase.execute({
        entregaIds: [50],
        lineas: [{ entregaDetalleId: 501, cantidad: 6 }],
        claveIdempotencia: 'invoice-test-002',
        actorId: 1,
      }),
    ).rejects.toThrow('supera lo entregado');
    expect(repository.createDraft).not.toHaveBeenCalled();
  });
});

import { PrepareInvoiceUseCase } from './prepare-invoice.use-case';

describe('PrepareInvoiceUseCase', () => {
  const invoice: any = {
    id: 9,
    empresaId: 1,
    clienteId: 2,
    pedidoId: 3,
    creadoPorId: 4,
    estado: 'BORRADOR',
    condicionPago: 'CREDITO',
    moneda: 'GTQ',
    subtotal: '112.00',
    descuentoTotal: '0.00',
    impuestoTotal: '0.00',
    total: '112.00',
    version: 0,
    emitidaEn: null,
    descartadaEn: null,
    motivoDescarte: null,
    detalles: [
      {
        id: 99,
        productoId: 5,
        pedidoDetalleId: 10,
        entregaDetalleId: 11,
        descripcion: 'Producto',
        bienOServicio: 'BIEN',
        unidadMedida: 'UN',
        cantidad: 1,
        precioUnitario: '112.00',
        precioBruto: '112.00',
        descuento: '0.00',
        impuestoTotal: '0.00',
        totalLinea: '112.00',
      },
    ],
  };

  const actors: any = {
    findById: jest.fn().mockResolvedValue({
      id: 4,
      nombre: 'Contabilidad',
      correo: 'conta@test.local',
      rol: 'CONTABILIDAD',
      activo: true,
      empresaId: 1,
    }),
  };

  const fiscal: any = {
    getCompanyProfile: jest.fn().mockResolvedValue({
      id: 1,
      empresaId: 1,
      nit: '1234567',
      razonSocial: 'MARCAS GT',
      afiliacionIva: 'GEN',
      correoFiscal: 'fel@test.local',
      direccion: 'Dirección',
      codigoPostal: null,
      municipio: 'Jacaltenango',
      departamento: 'Huehuetenango',
      pais: 'GT',
      preciosIncluyenImpuestos: true,
      tasaIvaDefault: '12.0000',
      activo: true,
    }),
    getEstablishment: jest.fn().mockResolvedValue({
      id: 10,
      empresaId: 1,
      codigoSat: 1,
      nombreComercial: 'MARCAS',
      correo: null,
      direccion: 'Dirección',
      codigoPostal: null,
      municipio: 'Jacaltenango',
      departamento: 'Huehuetenango',
      pais: 'GT',
      esPrincipal: true,
      activo: true,
    }),
    getCustomerProfile: jest.fn().mockResolvedValue({
      clienteId: 2,
      tipoIdentificacion: 'NIT',
      identificacion: '9876543',
      nombreFiscal: 'Cliente',
      correoFiscal: null,
      direccion: 'Cliente',
      codigoPostal: null,
      municipio: 'Jacaltenango',
      departamento: 'Huehuetenango',
      pais: 'GT',
    }),
    getProductProfiles: jest.fn().mockResolvedValue([
      {
        productoId: 5,
        bienOServicio: 'BIEN',
        unidadMedida: 'UN',
        descripcionFiscal: 'Producto',
        nombreCortoImpuesto: 'IVA',
        codigoUnidadGravable: 1,
        activo: true,
      },
    ]),
    getProviderConfig: jest.fn().mockResolvedValue(null),
  };

  it('prepara un snapshot aun sin credenciales del certificador', async () => {
    const invoices: any = { findById: jest.fn().mockResolvedValue(invoice) };
    const fiscalDocuments: any = {
      prepare: jest.fn().mockResolvedValue({
        id: 100,
        facturaId: 9,
        serieInterna: 'FEL',
        numeroInterno: 1,
        estado: 'PREPARADO',
      }),
    };

    const useCase = new PrepareInvoiceUseCase(
      invoices,
      fiscalDocuments,
      actors,
      fiscal,
    );

    const result = await useCase.execute({
      id: 9,
      tipoDte: 'FACT',
      entorno: 'PRUEBAS',
      actorId: 4,
    });

    expect(result.estado).toBe('PREPARADO');
    expect(fiscalDocuments.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        proveedorFelConfigId: null,
        impuestoTotal: '12.00',
        detalles: [
          expect.objectContaining({
            facturaDetalleId: 99,
            impuestoTotal: '12.00',
          }),
        ],
      }),
    );
  });

  it('bloquea preparación si falta el perfil fiscal del cliente', async () => {
    const invoices: any = { findById: jest.fn().mockResolvedValue(invoice) };
    const fiscalDocuments: any = { prepare: jest.fn() };
    const missingCustomer = {
      ...fiscal,
      getCustomerProfile: jest.fn().mockResolvedValue(null),
    };

    const useCase = new PrepareInvoiceUseCase(
      invoices,
      fiscalDocuments,
      actors,
      missingCustomer,
    );

    await expect(
      useCase.execute({
        id: 9,
        tipoDte: 'FACT',
        entorno: 'PRUEBAS',
        actorId: 4,
      }),
    ).rejects.toMatchObject({ code: 'FISCAL_CUSTOMER_PROFILE_MISSING' });
  });
});

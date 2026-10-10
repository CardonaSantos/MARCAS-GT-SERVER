import {
  AddShipmentObservationUseCase,
  CancelShipmentUseCase,
  ReportShipmentIncidentUseCase,
  ResolveShipmentIncidentUseCase,
  StartShipmentRouteUseCase,
} from './workflow.use-cases';

describe('Transport workflow application use-cases', () => {
  const workflow = {
    startRoute: jest.fn(),
    cancelShipment: jest.fn(),
    reportIncident: jest.fn(),
    resolveIncident: jest.fn(),
    addObservation: jest.fn(),
  } as any;

  const query = {
    getShipmentState: jest.fn(),
  } as any;

  const actors = {
    findById: jest.fn(),
  } as any;

  const admin = {
    id: 1,
    nombre: 'Admin',
    correo: 'admin@test.local',
    rol: 'ADMIN',
    activo: true,
    empresaId: 5,
  };

  const courier = {
    id: 9,
    nombre: 'Repartidor',
    correo: 'rep@test.local',
    rol: 'REPARTIDOR',
    activo: true,
    empresaId: 5,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    actors.findById.mockImplementation(async (id: number) =>
      id === 9 ? courier : admin,
    );
  });

  describe('StartShipmentRouteUseCase', () => {
    const useCase = new StartShipmentRouteUseCase(workflow, query, actors);

    it('permite iniciar ruta al REPARTIDOR responsable', async () => {
      query.getShipmentState.mockResolvedValue({
        id: 10,
        estado: 'CARGADO',
        modalidad: 'INTERNO',
        version: 3,
        responsableId: 9,
      });

      await useCase.execute({
        id: 10,
        actorId: 9,
        claveIdempotencia: 'START-ENV-10-001',
        latitud: 15.1,
        longitud: -91.1,
      });

      expect(workflow.startRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          shipmentId: 10,
          expectedVersion: 3,
          actorId: 9,
        }),
      );
    });

    it('rechaza REPARTIDOR que no es responsable', async () => {
      query.getShipmentState.mockResolvedValue({
        id: 10,
        estado: 'CARGADO',
        modalidad: 'INTERNO',
        version: 3,
        responsableId: 88,
      });

      await expect(
        useCase.execute({
          id: 10,
          actorId: 9,
          claveIdempotencia: 'START-ENV-10-002',
        }),
      ).rejects.toMatchObject({
        code: 'TRANSPORT_FORBIDDEN',
      });
    });

    it('ADMIN puede operar aunque no sea responsable', async () => {
      query.getShipmentState.mockResolvedValue({
        id: 10,
        estado: 'CARGADO',
        modalidad: 'INTERNO',
        version: 3,
        responsableId: 9,
      });

      await expect(
        useCase.execute({
          id: 10,
          actorId: 1,
          claveIdempotencia: 'START-ENV-10-003',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('CancelShipmentUseCase', () => {
    const useCase = new CancelShipmentUseCase(workflow, query, actors);

    it('ADMIN envía expectedVersion al workflow', async () => {
      query.getShipmentState.mockResolvedValue({
        id: 20,
        estado: 'PROGRAMADO',
        modalidad: 'INTERNO',
        version: 6,
        responsableId: null,
      });

      await useCase.execute({
        id: 20,
        actorId: 1,
        motivo: 'Cliente solicitó reprogramación',
        claveIdempotencia: 'CANCEL-ENV-20-001',
      });

      expect(workflow.cancelShipment).toHaveBeenCalledWith(
        expect.objectContaining({
          shipmentId: 20,
          expectedVersion: 6,
          actorId: 1,
        }),
      );
    });

    it('REPARTIDOR no puede cancelar administrativamente', async () => {
      query.getShipmentState.mockResolvedValue({
        id: 20,
        estado: 'PROGRAMADO',
        modalidad: 'INTERNO',
        version: 6,
        responsableId: 9,
      });

      await expect(
        useCase.execute({
          id: 20,
          actorId: 9,
          motivo: 'No puedo continuar',
          claveIdempotencia: 'CANCEL-ENV-20-002',
        }),
      ).rejects.toMatchObject({
        code: 'TRANSPORT_FORBIDDEN',
      });
    });
  });

  describe('AddShipmentObservationUseCase', () => {
    const useCase = new AddShipmentObservationUseCase(workflow, query, actors);

    it('solo agrega observación cuando el envío está dentro del scope del actor', async () => {
      query.getShipmentState.mockResolvedValue({
        id: 25,
        estado: 'PROGRAMADO',
        modalidad: 'INTERNO',
        version: 0,
        responsableId: null,
      });

      await useCase.execute({
        id: 25,
        actorId: 1,
        detalle: 'Observación autorizada',
        claveIdempotencia: 'OBS-ENV-25-001',
      });

      expect(workflow.addObservation).toHaveBeenCalledWith({
        shipmentId: 25,
        actorId: 1,
        detalle: 'Observación autorizada',
        claveIdempotencia: 'OBS-ENV-25-001',
      });
    });

    it('oculta un envío fuera del scope', async () => {
      query.getShipmentState.mockResolvedValue(null);

      await expect(
        useCase.execute({
          id: 25,
          actorId: 1,
          detalle: 'No debería escribirse',
          claveIdempotencia: 'OBS-ENV-25-002',
        }),
      ).rejects.toMatchObject({
        code: 'TRANSPORT_NOT_FOUND',
      });

      expect(workflow.addObservation).not.toHaveBeenCalled();
    });
  });

  describe('Incident use-cases', () => {
    const report = new ReportShipmentIncidentUseCase(workflow, query, actors);
    const resolve = new ResolveShipmentIncidentUseCase(workflow, query, actors);

    beforeEach(() => {
      query.getShipmentState.mockResolvedValue({
        id: 30,
        estado: 'EN_RUTA',
        modalidad: 'INTERNO',
        version: 4,
        responsableId: 9,
      });
    });

    it('responsable puede reportar incidencia con GPS', async () => {
      workflow.reportIncident.mockResolvedValue({ id: 77 });

      const result = await report.execute({
        id: 30,
        actorId: 9,
        tipo: 'AVERIA',
        severidad: 'ALTA',
        descripcion: 'Falla de motor',
        latitud: 15.2,
        longitud: -91.2,
        claveIdempotencia: 'INC-ENV-30-001',
      });

      expect(result).toEqual({ id: 77 });
      expect(workflow.reportIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          shipmentId: 30,
          actorId: 9,
          tipo: 'AVERIA',
          severidad: 'ALTA',
        }),
      );
    });

    it('responsable puede resolver una incidencia', async () => {
      await resolve.execute({
        id: 30,
        incidentId: 77,
        actorId: 9,
        resolucion: 'Vehículo reparado',
        claveIdempotencia: 'RESOLVE-ENV-30-001',
      });

      expect(workflow.resolveIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          shipmentId: 30,
          incidentId: 77,
          actorId: 9,
        }),
      );
    });

    it('otro repartidor no puede resolver incidencia ajena', async () => {
      actors.findById.mockResolvedValue({
        ...courier,
        id: 11,
      });

      await expect(
        resolve.execute({
          id: 30,
          incidentId: 77,
          actorId: 11,
          resolucion: 'Listo',
          claveIdempotencia: 'RESOLVE-ENV-30-002',
        }),
      ).rejects.toMatchObject({
        code: 'TRANSPORT_FORBIDDEN',
      });
    });
  });
});

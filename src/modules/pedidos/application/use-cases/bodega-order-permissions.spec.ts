import { OrderForbiddenError, OrderInvalidStateError } from '../../domain/errors/order.errors';
import {
  FakeOrderActorDirectory,
  FakeOrderCustomerDirectory,
  FakeOrderProductCatalog,
  FakeOrderRepository,
  FakeOrderVisitDirectory,
  draftOrder,
  sellerActor,
} from '../../testing/order.fakes';
import { CancelOrderUseCase } from './cancel-order.use-case';
import { ConfirmOrderUseCase } from './confirm-order.use-case';
import { CreateOrderUseCase } from './create-order.use-case';
import { RequestOrderValidationUseCase } from './request-order-validation.use-case';
import { UpdateOrderUseCase } from './update-order.use-case';

function setup() {
  const users = new FakeOrderActorDirectory();
  const repository = new FakeOrderRepository();
  const customers = new FakeOrderCustomerDirectory();
  const visits = new FakeOrderVisitDirectory();
  const products = new FakeOrderProductCatalog();
  users.users.set(20, { ...sellerActor(20), rol: 'BODEGA' });
  users.users.set(7, sellerActor(7));
  customers.ids.add(10);
  products.rows.set(100, {
    id: 100, codigo: 'P100', nombre: 'Producto', precio: '25.00',
  });
  repository.entity = draftOrder();
  return {
    users, repository, customers, visits, products,
    update: new UpdateOrderUseCase(repository, users, customers, visits, products),
    request: new RequestOrderValidationUseCase(repository, users),
    cancel: new CancelOrderUseCase(repository, users),
    confirm: new ConfirmOrderUseCase(repository, users),
    create: new CreateOrderUseCase(repository, users, customers, visits, products),
  };
}

describe('Pedidos - rol BODEGA', () => {
  it('permite crear un borrador asignado al vendedor de la empresa', async () => {
    const s = setup();
    const created = await s.create.execute({
      actorId: 20,
      clienteId: 10,
      vendedorId: 7,
      condicionPago: 'PREPAGO',
      detalles: [{ productoId: 100, cantidadSolicitada: 2 }],
    });
    expect(created.estado).toBe('BORRADOR');
    expect(created.vendedorId).toBe(7);
    expect(created.empresaId).toBe(1);
    expect(s.repository.events[0].tipo).toBe('CREADO');
  });

  it('permite editar cualquier borrador de la misma empresa y mantiene su vendedor', async () => {
    const s = setup();
    const updated = await s.update.execute({
      id: 1,
      actorId: 20,
      vendedorId: 7,
      observaciones: 'Cambio de embalaje desde BODEGA',
      detalles: [{ productoId: 100, cantidadSolicitada: 3, descuento: '0.00' }],
    });
    expect(updated.vendedorId).toBe(7);
    expect(updated.observaciones).toBe('Cambio de embalaje desde BODEGA');
    expect(updated.total).toBe('75.00');
    expect(s.repository.events[0].tipo).toBe('ACTUALIZADO');
  });

  it('permite enviar un borrador a validacion', async () => {
    const s = setup();
    const requested = await s.request.execute({ id: 1, actorId: 20 });
    expect(requested.estado).toBe('PENDIENTE_VALIDACION');
    expect(s.repository.events[0].tipo).toBe('VALIDACION_SOLICITADA');
  });

  it('permite cancelar un borrador sin actividad operativa', async () => {
    const s = setup();
    const cancelled = await s.cancel.execute({
      id: 1, actorId: 20, motivo: 'El cliente modifico su solicitud',
    });
    expect(cancelled.estado).toBe('CANCELADO');
    expect(s.repository.events[0].tipo).toBe('CANCELADO');
  });

  it('rechaza operaciones sobre pedidos de otra empresa', async () => {
    const s = setup();
    s.users.users.set(20, { ...sellerActor(20), rol: 'BODEGA', empresaId: 2 });
    await expect(s.update.execute({ id: 1, actorId: 20, observaciones: 'No autorizado' }))
      .rejects.toBeInstanceOf(OrderForbiddenError);
    await expect(s.request.execute({ id: 1, actorId: 20 }))
      .rejects.toBeInstanceOf(OrderForbiddenError);
    await expect(s.cancel.execute({ id: 1, actorId: 20, motivo: 'No autorizado' }))
      .rejects.toBeInstanceOf(OrderForbiddenError);
  });

  it('impide que BODEGA confirme un pedido pendiente de validacion', async () => {
    const s = setup();
    s.repository.entity!.requestValidation();
    await expect(s.confirm.execute({ id: 1, actorId: 20 }))
      .rejects.toBeInstanceOf(OrderForbiddenError);
    expect(s.repository.entity!.estado).toBe('PENDIENTE_VALIDACION');
  });

  it('conserva las restricciones de edicion de un pedido ya solicitado', async () => {
    const s = setup();
    s.repository.entity!.requestValidation();
    await expect(s.update.execute({ id: 1, actorId: 20, observaciones: 'Tardio' }))
      .rejects.toBeInstanceOf(OrderInvalidStateError);
  });

  it('no permite que otro vendedor edite pedidos ajenos', async () => {
    const s = setup();
    s.users.users.set(30, sellerActor(30));
    await expect(s.update.execute({ id: 1, actorId: 30, observaciones: 'Ajeno' }))
      .rejects.toBeInstanceOf(OrderForbiddenError);
  });
});

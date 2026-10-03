# Pagos V1 — integración

## Autoridad del módulo

Pagos V1 es dueño de:

- Pago
- PagoComprobante
- PagoAplicacion
- PagoEvento

El flujo legacy PagoCredito / CuotaCredito no se utiliza para nuevas operaciones.

## Flujo

PENDIENTE -> VERIFICADO -> ANULADO
          -> RECHAZADO

Solo un pago VERIFICADO puede aplicarse a CuentaPorCobrar.

## Aplicación

La aplicación se ejecuta en PostgreSQL SERIALIZABLE y valida:

- misma empresa;
- mismo cliente;
- misma moneda;
- mismo pedido cuando Pago.pedidoId está definido;
- pago VERIFICADO;
- cuenta por cobrar no anulada;
- monto <= disponible del pago;
- monto <= saldo pendiente de CxC.

La misma transacción modifica PagoAplicacion y CuentaPorCobrar.

## Reversión y anulación

Las aplicaciones no se eliminan.

ACTIVA -> REVERSADA

Anular un pago VERIFICADO revierte todas sus aplicaciones activas y restaura los saldos de las CxC afectadas.

## Estados derivados

Pedido.estadoPago se deriva del dinero VERIFICADO reconocido para el pedido.

Credito.estado se deriva de sus CuentaPorCobrar:

- todas en saldo 0 -> CERRADO;
- alguna con saldo -> ACTIVO.

## Métodos

- EFECTIVO
- TARJETA
- TRANSFERENCIA_BANCO
- DEPOSITO
- CHEQUE
- OTRO

TRANSFERENCIA_BANCO, DEPOSITO y CHEQUE requieren banco y referencia.

## Roles

ADMIN / CONTABILIDAD:
- registrar;
- verificar;
- rechazar;
- aplicar;
- revertir;
- anular;
- consultar.

VENDEDOR:
- registrar pagos de sus propios pedidos;
- adjuntar comprobantes;
- consultar únicamente pagos de sus pedidos.

## Endpoints

- GET /pagos
- GET /pagos/resumen
- POST /pagos
- GET /pagos/:id
- GET /pagos/:id/eventos
- GET /pagos/:id/aplicaciones
- GET /pagos/:id/cuentas-candidatas
- POST /pagos/:id/comprobantes
- POST /pagos/:id/verificar
- POST /pagos/:id/rechazar
- POST /pagos/:id/aplicaciones
- POST /pagos/:pagoId/aplicaciones/:aplicacionId/revertir
- POST /pagos/:id/anular

# Pagos directos y conciliación contable

## Regla y alcance

`PREPAGO` y `CONTRAENTREGA`: verificar un pago enlazado a un
`pedidoId` actualiza automáticamente `Pedido.estadoPago`, como antes.
**No se registra un segundo pago** ni se crea una deuda para "vaciar"
`montoDisponible`.

Durante `PaymentWorkflowPrismaAdapter.verify` se intenta además aplicar el
saldo disponible contra CxC **ya existentes**, compatibles con el pedido:
misma empresa, cliente y moneda, `creditoId = null`, saldo pendiente positivo
y estado activo. El registro se realiza en la **misma transacción serializable**
que la verificación; crea `PagoAplicacion`, disminuye el saldo de CxC y
registra un `PagoEvento` de conciliación automática. La clave
`direct-payment:<pagoId>:receivable:<cxcId>` evita duplicados.
Las aplicaciones revertidas NO se recrean de manera silenciosa.

`CREDITO`: no cambia el workflow de cuotas ni el uso de `PagoAplicacion`.
Los saldos de créditos no son candidatos a esta conciliación automática.

## Dos magnitudes distintas

- `montoDisponible`: saldo del pago no aplicado a CxC (compatibilidad API).
- `montoVinculadoPedido`: saldo verificado de PREPAGO/CONTRAENTREGA
  vinculado al pedido, en espera de eventual CxC.
- `montoLibreCxC`: saldo de pagos no directos disponible para cartera.
- La suma de los dos últimos equivale a `montoDisponible` solo cuando el
  pago está VERIFICADO. La UI NO presenta saldo vinculado como dinero a cobrar.

El resumen agrega `montos.vinculadoPedido` y `montos.libreCxC`
sin modificar `montos.disponibleNoAplicado`.

## Integración pendiente de CxC posteriores

En el backend actual, Facturación pre-FEL **crea borradores**, no crea CxC
al facturar. Las CxC que actualmente sí se materializan automáticamente
proceden del plan de cuotas de `Créditos`. Por ello, no se ha introducido
una creación automática ficticia de CxC para prepagos.

El caso `reconcileVerifiedDirectPayment` puede invocarse dentro de una
transacción desde el futuro **caso de uso que cree la CxC de una factura**
después de emitirla, recorriendo pagos verificados del pedido. Esta llamada
deberá añadirse en ese caso de uso cuando exista; **hoy NO hay un hook
automático de conciliación retroactiva de una CxC creada posteriormente**.

No utilizar `prisma migrate dev`: este refactor no cambia tablas ni enums.

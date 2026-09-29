# PedidosModule — integración

## Base esperada

Este módulo fue generado para el schema `pedidos_v1` acordado en MARCAS UPDATE:

- `Pedido.numero`
- `Pedido.validacionSolicitadaEn`
- `Pedido.motivoCancelacion`
- `Pedido.version`
- `PedidoDetalle.observaciones`
- `PedidoDetalle.version`
- `PedidoEvento.referenciaTipo`
- `PedidoEvento.referenciaId`
- eventos `ACTUALIZADO` y `VALIDACION_SOLICITADA`

No incluye `schema.prisma` ni migraciones.

## Copia

Copiar completa:

```text
src/modules/pedidos/
```

Este paquete no reemplaza Bodegas, Inventario, Requisiciones ni Transferencias.

## AppModule

Agregar:

```ts
import { PedidosModule } from './modules/pedidos';
```

Y en `imports`:

```ts
PedidosModule,
```

## Endpoints V1

```text
POST  /pedidos
GET   /pedidos
GET   /pedidos/resumen
GET   /pedidos/:id
GET   /pedidos/:id/eventos
PATCH /pedidos/:id
PATCH /pedidos/:id/solicitar-validacion
PATCH /pedidos/:id/confirmar
PATCH /pedidos/:id/cancelar
```

## Workflow V1

```text
BORRADOR
  -> PENDIENTE_VALIDACION
  -> CONFIRMADO
```

`CREDITO` y `MIXTO` quedan deliberadamente bloqueados al confirmar hasta integrar
el módulo/capability de aprobación de Crédito.

La cancelación V1 solo se permite desde `BORRADOR` y `PENDIENTE_VALIDACION`.
Esto evita cancelar pedidos que ya puedan tener reservas o despachos sin una saga compensatoria.

## Autoridades

- Pedidos: intención comercial, cantidades solicitadas, snapshot de precio/descuento y workflow.
- Inventario: `cantidadReservada`.
- Despachos (futuro): `cantidadDespachada`.
- Entregas (futuro): `cantidadEntregada`.
- Pagos (futuro): transacciones; `Pedido.estadoPago` será una proyección.

## Puerto público

Solo se exporta:

```text
ORDER_DIRECTORY
OrderDirectoryPort
```

`ORDER_REPOSITORY` y `ORDER_QUERY` permanecen internos.

## Seguridad

- ADMIN, BODEGA, CONTABILIDAD: lectura de pedidos de la empresa derivada del actor.
- VENDEDOR: lectura de sus propios pedidos.
- ADMIN, VENDEDOR: crear/editar/solicitar validación/cancelar según estado.
- ADMIN: confirmar.
- `empresaId` nunca viene del frontend.
- El actor se obtiene de `request.user.userId` mediante los helpers compartidos.

## Listado enriquecido

`GET /pedidos` incluye:

- cliente
- vendedor
- visita
- cantidades solicitadas/reservadas/despachadas/entregadas
- porcentajes de avance
- último estado de crédito
- última orden de despacho y bodega
- `preparadoPor`
- última entrega
- resumen de pagos
- última factura
- montos del pedido

## Detalle

`GET /pedidos/:id` incluye además, con historial acotado:

- detalles de productos
- solicitudes de crédito
- despachos
- entregas
- pagos
- facturas
- últimos 20 eventos
- acciones disponibles

El historial completo de eventos se consulta paginado en `/pedidos/:id/eventos`.

## Reportería

`GET /pedidos/resumen` agrega en PostgreSQL/Prisma:

- total de pedidos
- montos bruto/descuento/neto
- pago verificado y pendiente estimado
- unidades solicitadas/reservadas/despachadas/entregadas
- conteos por estado
- conteos por estado de pago
- conteos por condición de pago
- top vendedores
- top productos

## Numeración

Los nuevos pedidos se numeran en servidor con el formato:

```text
PED-000001
```

Los pedidos legacy con `numero = NULL` se presentan con el mismo fallback visual,
sin mutar datos históricos.

## Precio

El frontend no envía `precioUnitario`, `subtotal` ni `total`.
`OrderProductCatalogPort` lee `Producto.precio` y el servidor congela el snapshot
en `PedidoDetalle.precioUnitario`.

`descuento` representa un monto monetario total por línea, no porcentaje.

## Despacho

El schema actual de `OrdenDespacho` tiene `preparadoPorId`, no `despachadoPorId`.
Por ello Pedidos muestra quién preparó la orden y no afirma quién ejecutó físicamente
la salida. Ese dato debe definirse al construir `DespachosModule`.

## Pruebas

```powershell
npm test -- pedidos --runInBand
npm run build
```

Después se recomiendan CORE Postman para crear, editar, solicitar validación,
confirmar PREPAGO, bloquear CREDITO, cancelar, listar, consultar resumen y eventos.

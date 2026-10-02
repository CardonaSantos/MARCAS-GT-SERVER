# EntregasModule V1

## Responsabilidad

Entregas es dueño del resultado físico frente al cliente:

- Entrega / EntregaDetalle;
- receptor;
- cantidades aceptadas y rechazadas;
- no-entrega y motivos;
- GPS de cierre;
- evidencias;
- timeline de auditoría;
- read-side, resumen y reportería.

No es dueño de Pedido, OrdenDespacho, Envio, EnvioDespacho, Vehiculo,
Conductor, Factura ni Pago.

## Integraciones

### Transporte

Consume exclusivamente:

- TRANSPORT_DIRECTORY
- TRANSPORT_DELIVERY_GATE

TRANSPORT_DIRECTORY expone la parada, empresa, modalidad, responsable,
destino y carga confirmada.

TRANSPORT_DELIVERY_GATE es la única vía de escritura hacia Transporte.
Entregas nunca muta directamente Envio/EnvioDespacho/Vehiculo/Conductor.

### Despachos

Consume DISPATCH_DIRECTORY para resolver pedidoDetalleId y validar que
la carga corresponde a la orden física.

### Pedidos

Se agrega ORDER_DELIVERY_GATE en PedidosModule.

Es la única vía de escritura hacia Pedido/PedidoDetalle. Registra cantidades
entregadas acumuladas, recalcula PARCIALMENTE_ENTREGADO/ENTREGADO y genera
PedidoEvento idempotente con referencia ENTREGA.

### Facturación futura

Entregas exporta DELIVERY_DIRECTORY. Facturación debe consumir
findBillableById() y facturar cantidades efectivamente entregadas, no
cantidades despachadas.

## Workflow

PENDIENTE -> EN_RUTA -> ENTREGADA | PARCIAL | RECHAZADA | NO_ENTREGADA

Los estados finales son terminales para operación V1.

## Idempotencia de finalización

La finalización coordina:

1. ORDER_DELIVERY_GATE;
2. TRANSPORT_DELIVERY_GATE;
3. cierre local de Entrega.

Los gates externos son idempotentes. Si la operación falla entre pasos, el
retry no duplica cantidades ni eventos.

## Evidencias

EntregaEvidencia soporta FIRMA, FOTO, DOCUMENTO y OTRO.

El endpoint acepta una URL ya cargada o contenido para Cloudinary. El storage
está detrás de DeliveryEvidenceStoragePort.

## Read side

GET /entregas
GET /entregas/candidatos
GET /entregas/:id
GET /entregas/:id/eventos
GET /entregas/:id/evidencias
GET /entregas/resumen
GET /entregas/reportes/operacion

El detalle incluye Pedido, Cliente, Vendedor, Despacho, Bodega, Transporte,
responsable, carga, cantidades, evidencia, GPS, distancia contra destino,
tracking actual, factura, acciones y advertencias.

## Escrituras

POST   /entregas
POST   /entregas/:id/iniciar
PATCH  /entregas/:id/resultado
POST   /entregas/:id/evidencias
DELETE /entregas/:id/evidencias/:evidenciaId
POST   /entregas/:id/finalizar
POST   /entregas/:id/observaciones

## Seguridad

ADMIN/BODEGA:
- operación y lectura global de su empresa.

REPARTIDOR:
- solo paradas donde Envio.responsableId = actor.

VENDEDOR:
- lectura de entregas de sus propios pedidos.

CONTABILIDAD:
- lectura y reportería global de su empresa.

empresaId nunca proviene del frontend.

## Integridad

- cantidades siempre se validan contra EnvioCargaDetalle.cantidadCargada;
- cantidades entregadas acumuladas nunca superan PedidoDetalle.cantidadDespachada;
- optimistic locking en Entrega y EntregaDetalle;
- claves idempotentes para comandos y eventos;
- GPS interno requerido al finalizar;
- ENTREGADA exige toda la carga aceptada y firma/foto;
- PARCIAL exige aceptación parcial y evidencia;
- NO_ENTREGADA exige motivo.

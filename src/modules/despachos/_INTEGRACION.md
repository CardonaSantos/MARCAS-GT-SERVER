# DespachosModule

## Responsabilidad

Administra la ejecución física de pedidos en bodega:

1. bandeja de pedidos candidatos;
2. planificación de una o varias órdenes;
3. reserva de inventario para preparación;
4. preparación física;
5. confirmación de preparación;
6. salidas parciales/completas;
7. liberación de reservas y cancelación;
8. operaciones persistidas, idempotencia y reintentos;
9. auditoría;
10. read models enriquecidos y reportería.

Despachos no es dueño de StockBodega, ReservaInventario, MovimientoInventario
ni de los estados comerciales del Pedido.

## Integraciones

### Pedidos

Se agregan:
- `ORDER_DISPATCH_GATE`
- `OrderDispatchGatePort`
- `OrderDispatchGateAdapter`

Es la única vía de escritura desde Despachos hacia Pedido/PedidoDetalle.

### Inventario

Se consumen:
- `INVENTORY_AVAILABILITY`
- `INVENTORY_OPERATIONS`
- `INVENTORY_RESERVATION_DIRECTORY`

Se agrega el directorio de reservas para evitar consultas Prisma cruzadas desde
el bounded context de Despachos.

### Bodegas

`BodegaDirectoryEntry` expone `empresaId` para validar aislamiento
multiempresa sin depender del repositorio de Bodegas.

## Saga persistida

`OperacionDespacho` + `OperacionDespachoDetalle` funcionan como bitácora
técnica y mecanismo de recuperación.

Tipos:
- `RESERVA_PREPARACION`
- `SALIDA_DESPACHO`
- `LIBERACION_RESERVA`

Cada operación tiene una clave de idempotencia global y cada línea una clave
derivada. Si Inventario ya aplicó una mutación, un retry obtiene el mismo
MovimientoInventario y continúa desde allí.

## Despachos parciales sucesivos

`ReservaInventario` tiene unique `(pedidoDetalleId, stockBodegaId)`.
Por ello `increase()` ahora permite reabrir una reserva cerrada y conservar
sus acumulados históricos. Esto permite reservar nuevamente el saldo de un
pedido tras haber aplicado completamente una reserva anterior.

## Read side administrativo

### `GET /despachos/candidatos`

Bandeja paginada de pedidos con unidades todavía no planificadas. Con
`bodegaId` enriquece cada línea con:
- stock real;
- reservado;
- disponible;
- suficiencia para el pendiente.

### `GET /despachos`

Filtros:
- estado;
- bodega;
- pedido;
- cliente;
- vendedor;
- creador/preparador/despachador;
- rangos de creación/programación;
- pendientes;
- atrasados;
- ordenamiento.

Cada fila incluye:
- pedido, cliente, vendedor y bodega;
- progreso;
- porcentajes;
- horas operativas;
- atraso;
- conteo de operaciones/fallos;
- última actividad.

### `GET /despachos/:id`

Detalle enriquecido con:
- cantidades Pedido vs Despacho;
- stock actual;
- reserva;
- operaciones recientes;
- timeline;
- envíos;
- entregas;
- acciones permitidas por rol/estado;
- advertencias operativas.

### `GET /despachos/resumen`

Incluye:
- conteos por estado;
- abiertas/atrasadas;
- unidades programadas/preparadas/despachadas;
- pendientes;
- porcentajes;
- tiempos promedio;
- operaciones por estado;
- indicadores del día en `America/Guatemala`;
- top bodegas;
- top operadores.

### `GET /despachos/reportes/operacion`

Reporte operativo para administración:
- puntualidad contra `programadoEn`;
- despachos a tiempo/tarde/sin programación;
- aging de la cola abierta (<4h, 4-8h, 8-24h, 24-48h, 48h+);
- tasa de fallos y porcentaje de operaciones con reintentos;
- intentos promedio;
- tendencia diaria de creación/preparación/despacho/fallos;
- desempeño por bodega con horas promedio de preparación y ciclo.

Si no se envía rango, usa los últimos 30 días para actividad; el aging siempre
muestra la cola abierta actual dentro del scope del usuario.

### Operaciones y auditoría

- `GET /despachos/operaciones`
- `GET /despachos/:id/operaciones`
- `POST /despachos/operaciones/:operationId/reintentar`
- `GET /despachos/:id/eventos`

## Escrituras

- `POST /despachos`
- `PATCH /despachos/:id`
- `POST /despachos/:id/iniciar-preparacion`
- `PATCH /despachos/:id/preparacion`
- `POST /despachos/:id/finalizar-preparacion`
- `POST /despachos/:id/salidas`
- `POST /despachos/:id/cancelar`
- `POST /despachos/:id/observaciones`

## Roles

Lectura:
- ADMIN
- BODEGA
- CONTABILIDAD
- VENDEDOR
- REPARTIDOR

Operación:
- ADMIN
- BODEGA

VENDEDOR queda limitado en el read side a pedidos propios.

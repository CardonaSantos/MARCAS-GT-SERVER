# RequisicionesModule — integración

## Objetivo

Módulo hexagonal para requisiciones y recepción física de mercadería.

Flujo:

```text
BORRADOR -> SOLICITADA -> APROBADA -> PARCIAL -> COMPLETADA
                    \-> RECHAZADA
BORRADOR/SOLICITADA/APROBADA/PARCIAL -> CANCELADA
```

Una requisición aprobada NO modifica inventario. El inventario cambia únicamente cuando se registra una recepción física.

## Dependencias públicas reutilizadas

No acceder directamente a tablas internas de Bodegas o Inventario.

- `BODEGA_DIRECTORY` de `src/modules/bodegas`.
- `INVENTORY_OPERATIONS` de `src/modules/inventario`.
- `PageResult`, `SortDirection`, `buildPageMeta` de `src/shared/application/pagination/page.models.ts`.

La recepción usa:

```text
INVENTORY_OPERATIONS.registerReceipt(...)
```

con claves de idempotencia hijas deterministas:

```text
REQUISICION:{requisicionId}:RECEPCION:{recepcionId}:DETALLE:{recepcionDetalleId}
```

Esto permite reintentar una recepción después de un fallo sin duplicar stock.

## Prisma esperado

Este módulo presupone aplicada la migración `requisiciones_v1` descrita en el proyecto:

- `Requisicion.version`.
- `Requisicion.rechazadaEn`, `canceladaEn`, `motivoRechazo`, `motivoCancelacion`.
- `RequisicionDetalle.costoUnitarioEstimado Decimal(14,4)`.
- `RequisicionDetalle.version`.
- `RequisicionEvento`, SIN JSON.
- `RecepcionRequisicion`.
- `RecepcionRequisicionDetalle`.
- `TipoEventoRequisicion`.
- `EstadoRecepcionRequisicion`.
- relaciones correspondientes en `Usuario`, `Requisicion` y `RequisicionDetalle`.
- CHECK constraints acordados para cantidades, costos, versionado e idempotencia.

No se usa `metadata` ni ningún campo `Json`.

## Copia

Copiar:

```text
src/modules/requisiciones
```

a:

```text
src/modules/requisiciones
```

El paquete también incluye tres helpers compartidos:

```text
src/shared/security/roles.decorator.ts
src/shared/security/current-actor.decorator.ts
src/shared/security/active-user-roles.guard.ts
```

Copiarlos en `src/shared/security`.

Estos helpers existen para NO volver a crear un guard/decorator de roles por cada módulo. Requisiciones ya los consume.

### Refactor posterior recomendado

Bodegas e Inventario actualmente tienen sus propios:

```text
*-roles.guard.ts
*-roles.decorator.ts
current-*-actor.decorator.ts
```

No hace falta moverlos para instalar Requisiciones. Más adelante se pueden reemplazar por los helpers de `src/shared/security` y borrar las versiones específicas cuando Bodegas/Inventario estén migrados y testeados.

No hacerlo a ciegas en el mismo cambio si esos módulos ya están estables.

## AppModule

Agregar:

```ts
import { RequisicionesModule } from './modules/requisiciones';
```

y en `imports`:

```ts
RequisicionesModule,
```

## Contrato público

El módulo exporta exclusivamente:

```text
REQUISITION_DIRECTORY
```

con un contrato mínimo para otros dominios.

No exporta el repository Prisma ni la query interna.

## Roles

```text
ADMIN
- lectura completa
- crear/editar/solicitar
- aprobar/rechazar/cancelar
- registrar recepción

BODEGA
- lectura completa
- crear/editar/solicitar
- registrar recepción

CONTABILIDAD
- lectura completa/reportería/costos

VENDEDOR
- sin gestión directa

REPARTIDOR
- sin gestión directa
```

El guard compartido revalida `Usuario.activo` y `Usuario.rol` contra BD; no confía únicamente en el rol del JWT.

## Endpoints

### Tabla server-side

```http
GET /requisiciones
```

Filtros:

```text
page
limit
search
estado
bodegaDestinoId
proveedorId
solicitanteId
fechaDesde
fechaHasta
soloPendientesRecepcion
sortBy
sortDir
```

`search` contempla bodega, proveedor, solicitante, observaciones, código y nombre de producto.

### Reportería

```http
GET /requisiciones/resumen
```

Filtros opcionales:

```text
bodegaDestinoId
proveedorId
fechaDesde
fechaHasta
```

Incluye:

```text
totales por estado
abiertas
unidades solicitadas
unidades recibidas
unidades pendientes
costo estimado total
recepciones pendientes
recepciones fallidas
```

### Recepciones globales

```http
GET /requisiciones/recepciones
```

Filtros:

```text
requisicionId
bodegaDestinoId
proveedorId
recibidoPorId
estado
fechaDesde
fechaHasta
page
limit
```

### Detalle

```http
GET /requisiciones/:id
```

Devuelve:

```text
datos generales
bodega
proveedor
solicitante
progreso
detalles con cantidades pendientes
recepciones recientes
eventos recientes
acciones posibles por estado
```

### Eventos

```http
GET /requisiciones/:id/eventos
```

### Recepciones de una requisición

```http
GET /requisiciones/:id/recepciones
```

### Mutaciones

```http
POST  /requisiciones
PATCH /requisiciones/:id
PATCH /requisiciones/:id/solicitar
PATCH /requisiciones/:id/aprobar
PATCH /requisiciones/:id/rechazar
PATCH /requisiciones/:id/cancelar
POST  /requisiciones/:id/recepciones
```

## Payload de creación

```json
{
  "bodegaDestinoId": 1,
  "proveedorId": 4,
  "observaciones": "Reposición de temporada",
  "detalles": [
    {
      "productoId": 15334,
      "cantidadSolicitada": 20,
      "costoUnitarioEstimado": "26.4000"
    }
  ]
}
```

## Payload de recepción

```json
{
  "claveIdempotencia": "REQ-1-RECEPCION-1",
  "documentoReferencia": "FAC-123",
  "observaciones": "Primera entrega parcial",
  "detalles": [
    {
      "requisicionDetalleId": 1,
      "cantidad": 8,
      "costoUnitario": "25.8000"
    }
  ]
}
```

## Consistencia e idempotencia de recepción

La recepción está diseñada como una pequeña saga entre Requisiciones e Inventario:

1. Requisiciones crea/recupera `RecepcionRequisicion` mediante `claveIdempotencia`.
2. Cada línea llama `INVENTORY_OPERATIONS.registerReceipt()` con una clave hija determinista.
3. Si el proceso cae después de impactar una línea, el reintento no duplica el movimiento de inventario.
4. Cuando todas las líneas están aplicadas, Requisiciones incrementa `cantidadRecibida` y deja la recepción `APLICADA`.
5. Si falla Inventario, la recepción queda `FALLIDA` con `errorAplicacion`; conserva la misma reserva lógica de cantidades y puede reintentarse con la misma clave.

`prepareReceipt()` usa transacción `SERIALIZABLE` y considera recepciones `PENDIENTE` y `FALLIDA` como cantidades reclamadas para evitar sobrerrecepción concurrente.

## Invariantes

- solo `BORRADOR` es editable;
- debe tener al menos un producto antes de solicitar;
- no se repiten productos;
- cantidad solicitada > 0;
- cantidad recibida nunca supera solicitada;
- proveedor activo requerido antes de aprobar/recibir;
- bodega destino debe estar activa;
- solo `APROBADA`/`PARCIAL` pueden recibir;
- aprobación no modifica Inventario;
- recepción física sí modifica Inventario;
- recepciones parciales permitidas;
- la última recepción cambia a `COMPLETADA` automáticamente;
- optimistic locking por `version`;
- recepción HTTP idempotente;
- movimientos de stock quedan en Inventario, eventos de workflow quedan en Requisiciones.

## Tests

```powershell
npm test -- requisiciones --runInBand
```

Luego:

```powershell
npm run build
```

## Limpieza por eliminación de JSON

Como en la migración se eliminaron `BodegaEvento.metadata` y `PedidoEvento.metadata`, asegúrate de limpiar referencias TypeScript antiguas antes del build:

```powershell
Get-ChildItem -Path src -Recurse -File | Select-String -Pattern "metadata"
```

En Bodegas, en el commit base anterior, existían referencias en:

```text
src/modules/bodegas/domain/bodega.types.ts
src/modules/bodegas/application/models/bodega.models.ts
src/modules/bodegas/infrastructure/persistence/prisma/bodega.prisma-repository.ts
src/modules/bodegas/infrastructure/persistence/prisma/bodega.prisma-query.adapter.ts
```

Eliminar el campo de los tipos/vistas y dejar la auditoría únicamente con `tipo`, `detalle`, actor y fecha.

# InventarioModule — integración

## Requisitos previos

Este paquete asume que ya están aplicados los cambios Prisma de Inventario v1:

- `StockBodega.version` y `costoPromedio Decimal(14,4)`.
- `ReservaInventario` con cantidades original/pendiente/aplicada/liberada, versionado y estados parciales.
- `MovimientoInventario` con costo promedio antes/después, reserva, clave de idempotencia e índices.
- `TipoMovimientoInventario.MIGRACION_INICIAL`.
- `EstadoReservaInventario.PARCIAL` y `FINALIZADA_MIXTA`.
- constraints SQL de integridad de stock, reserva, movimiento y `PedidoDetalle`.

También requiere el módulo ya instalado en `src/modules/bodegas`, exportando `BODEGA_DIRECTORY` desde `BodegaModule`.

## Copia

Copiar:

- `src/modules/inventario` -> `src/modules/inventario`
- `src/shared/application/pagination/page.models.ts` -> misma ruta del proyecto

No se añaden paquetes npm nuevos.

## AppModule

Agregar:

```ts
import { InventarioModule } from './modules/inventario';
```

Y en `imports`:

```ts
InventarioModule,
```

## Contratos públicos

El módulo exporta exclusivamente los tokens:

- `INVENTORY_AVAILABILITY`: consultas pequeñas de disponibilidad para Pedidos, UI comercial, reportes y otros consumidores.
- `INVENTORY_OPERATIONS`: operaciones transaccionales para Requisiciones, Pedidos, Despachos, Transferencias y devoluciones.

Los demás módulos no deben modificar `StockBodega`, `ReservaInventario` o `MovimientoInventario` directamente con Prisma.

## Endpoints HTTP

Lectura:

- `GET /inventario`
- `GET /inventario/resumen`
- `GET /inventario/productos/:productoId/disponibilidad`
- `GET /inventario/stocks/:id`
- `GET /inventario/movimientos`
- `GET /inventario/kardex/:productoId`
- `GET /inventario/reservas`
- `GET /inventario/reservas/:id`

Operación:

- `POST /inventario/entradas`
- `POST /inventario/ajustes`
- `POST /inventario/devoluciones`
- `POST /inventario/reservas`
- `PATCH /inventario/reservas/:id/aplicar`
- `PATCH /inventario/reservas/:id/liberar`
- `PATCH /inventario/reservas/:id/cancelar`

Las operaciones de transferencia se exponen a otros módulos mediante `INVENTORY_OPERATIONS`; no se publican como endpoints genéricos de Inventario porque el futuro módulo Transferencias debe gobernar su workflow.

## Roles

- ADMIN/BODEGA: administración y operaciones.
- ADMIN/BODEGA/CONTABILIDAD: inventario completo, costos, kardex y resumen.
- ADMIN/BODEGA/CONTABILIDAD/VENDEDOR: disponibilidad de producto.
- REPARTIDOR: sin gestión directa de inventario.

El guard revalida el usuario actual contra BD; no confía únicamente en el rol contenido en el JWT.

## Tabla server-side

`GET /inventario` admite:

- `page`, `limit`, `search`
- `bodegaId`, `productoId`
- `conExistencia`, `conReservas`
- `sortBy`, `sortDir`

`search` contempla código/nombre de producto y código/nombre de bodega.

La respuesta utiliza el contrato común:

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 20,
    "totalPages": 0
  }
}
```

## Invariantes

- No hay stock negativo.
- `disponible = real - reservado`.
- Reservar no cambia stock real.
- Liberar reserva no cambia stock real.
- Aplicar reserva reduce real y reservado por la misma cantidad.
- Una salida no puede superar disponibilidad.
- Una reserva no puede superar la capacidad pendiente de `PedidoDetalle`.
- Cada mutación genera `MovimientoInventario` en la misma transacción.
- Los movimientos son ledger inmutable: no hay update/delete.
- `version` protege concurrencia optimista.
- `claveIdempotencia` protege reintentos de operaciones externas.
- Costos se manejan con precisión decimal de cuatro posiciones.

## Idempotencia

Para integraciones entre módulos usar una clave determinista, por ejemplo:

```text
REQUISICION:45:DETALLE:9:RECEPCION:1
DESPACHO:81:DETALLE:3:APLICAR:1
TRANSFERENCIA:27:DETALLE:6:SALIDA
TRANSFERENCIA:27:DETALLE:6:ENTRADA
```

No reutilizar una clave para dos operaciones lógicamente diferentes.

## Tests

```powershell
npm test -- inventario --runInBand
```

Después:

```powershell
npm run build
```

## Nota sobre legado

Este módulo no utiliza `Stock`, `EntregaStock` ni `EntregaStockProducto` como fuente de verdad. Esas tablas pueden mantenerse temporalmente mientras se realiza la migración controlada hacia `StockBodega`.

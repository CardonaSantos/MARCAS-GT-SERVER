# Integración — Transferencias Hexagonal V1

Base de implementación: `update-requerimientos@6f860b6b50594d1cdde16930832e625d7e50969c`.

La migración `transferencias_v1` ya debe estar aplicada. Este paquete no
incluye `schema.prisma` ni una nueva migración.

## 1. Copiar módulo

Copiar:

```text
src/modules/transferencias/
```

a:

```text
<MARCAS-GT-SERVER>/src/modules/transferencias/
```

## 2. Aplicar el ajuste aditivo de Inventario

Reemplazar con los archivos incluidos en el ZIP:

```text
src/modules/inventario/application/models/inventory.models.ts
src/modules/inventario/application/use-cases/inventory-mutation.coordinator.ts
```

### Motivo

Transferencias necesita conservar el costo histórico exacto de una salida.

Antes, `InventoryMutationResult` solo devolvía el snapshot ACTUAL del stock.
En un reintento idempotente ese snapshot puede haber cambiado.

Ahora las mutaciones respaldadas por `MovimientoInventario` devuelven también:

```ts
movimiento?: {
  tipo;
  cantidad;
  costoUnitario;
  costoPromedioAntes;
  costoPromedioDespues;
  cantidadRealAntes;
  cantidadRealDespues;
  reservadaAntes;
  reservadaDespues;
}
```

El cambio es aditivo y no modifica Prisma.

`InventoryMutationCoordinator.result()` se conserva para los flujos de
reservas existentes. `resultWithMovement()` se usa en las mutaciones que
generan o recuperan un MovimientoInventario.

## 3. Registrar módulo en `src/app.module.ts`

Agregar:

```ts
import { TransferenciasModule } from './modules/transferencias';
```

y en `imports`:

```ts
TransferenciasModule,
```

No modificar BodegaModule ni InventarioModule para crear dependencias inversas.

## 4. Contratos

Transferencias consume únicamente los contratos públicos:

```text
BODEGA_DIRECTORY
INVENTORY_AVAILABILITY
INVENTORY_OPERATIONS
```

Internos:

```text
TRANSFER_REPOSITORY
TRANSFER_OPERATION_REPOSITORY
TRANSFER_QUERY
TRANSFER_ACTOR_DIRECTORY
```

Público:

```text
TRANSFER_DIRECTORY
```

El barrel público del módulo solo exporta:

```ts
TransferenciasModule
TRANSFER_DIRECTORY
TransferDirectoryPort
```

## 5. Roles

Lectura:

```text
ADMIN
BODEGA
CONTABILIDAD
```

Operaciones:

```text
ADMIN
BODEGA
```

No se confía en rol enviado por el cliente. Se reutilizan:

```text
src/shared/security/active-user-roles.guard.ts
src/shared/security/current-actor.decorator.ts
src/shared/security/roles.decorator.ts
```

## 6. API

```text
POST   /transferencias
GET    /transferencias
GET    /transferencias/resumen
GET    /transferencias/operaciones

GET    /transferencias/:id
GET    /transferencias/:id/eventos
GET    /transferencias/:id/operaciones

PATCH  /transferencias/:id
PATCH  /transferencias/:id/preparar
PATCH  /transferencias/:id/cancelar

POST   /transferencias/:id/salidas
POST   /transferencias/:id/recepciones
```

### Crear

```json
{
  "bodegaOrigenId": 1,
  "bodegaDestinoId": 2,
  "observaciones": "Traslado semanal",
  "detalles": [
    {
      "productoId": 15334,
      "cantidadSolicitada": 10,
      "observaciones": "Caja cerrada"
    }
  ]
}
```

Puede existir un BORRADOR sin detalles. `preparar` exige al menos uno.

### Preparar

```text
PATCH /transferencias/:id/preparar
```

Valida:

- actor activo;
- ambas bodegas activas;
- origen != destino;
- productos existentes;
- disponibilidad actual en origen.

PREPARADA no reserva inventario.

### Salida

```text
POST /transferencias/:id/salidas
```

```json
{
  "claveIdempotencia": "TRANSFER-CORE-001-SALIDA-001",
  "documentoReferencia": "TRAS-001",
  "observaciones": "Salida física"
}
```

La salida V1 es COMPLETA.

Cada producto ejecuta:

```text
INVENTORY_OPERATIONS.registerTransferOut()
```

El costo histórico devuelto por `movimiento.costoUnitario` queda conservado
en `TransferenciaBodegaOperacionDetalle.costoUnitario`.

### Recepción parcial

```text
POST /transferencias/:id/recepciones
```

```json
{
  "claveIdempotencia": "TRANSFER-CORE-001-REC-001",
  "documentoReferencia": "REC-001",
  "observaciones": "Recepción parcial",
  "detalles": [
    {
      "transferenciaDetalleId": 1,
      "cantidad": 4
    }
  ]
}
```

Usa exactamente el costo histórico de la salida para:

```text
INVENTORY_OPERATIONS.registerTransferIn()
```

El frontend NO envía costo.

## 7. Idempotencia y recuperación

Orden intencional:

```text
1. buscar/crear operación por clave idempotente
2. si ya APLICADA -> repeated=true
3. ejecutar/reintentar movimientos de Inventario
4. finalizar agregado
```

La idempotencia se evalúa antes que el estado actual del workflow.

Esto permite:

```text
salida aplicada
-> transferencia avanzó
-> cliente perdió respuesta
-> repite mismo POST
-> repeated=true
```

sin intentar una nueva salida.

Las operaciones FALLIDA/PENDIENTE reclaman cantidades de recepción. Una nueva
clave no puede saltarse una recepción fallida y sobre-recibir mercancía.
Debe reintentarse la clave original.

## 8. Concurrencia

Se usan:

```text
TransferenciaBodega.version
TransferenciaBodegaDetalle.version
TransferenciaBodegaOperacion.version
```

Las operaciones críticas usan transacciones `SERIALIZABLE` + retry de `P2034`.

No existe una falsa transacción común entre Transferencias e Inventario.
La consistencia entre módulos es una saga recuperable por idempotencia.

## 9. Pruebas

Ejecutar:

```powershell
npm test -- transferencias --runInBand
npm test -- inventario --runInBand
npm run build
```

Después hacer smoke tests HTTP.

## 10. Orden CORE recomendado

1. Crear transferencia.
2. Preparar.
3. Verificar inventario origen antes de salida.
4. Registrar salida completa.
5. Verificar que origen disminuyó y destino todavía NO aumentó.
6. Repetir salida con misma clave: `repeated=true`.
7. Registrar recepción parcial.
8. Verificar destino.
9. Repetir recepción parcial con misma clave.
10. Registrar recepción final.
11. Verificar `RECIBIDA`.
12. Intentar recepción adicional con nueva clave: debe fallar.
13. Repetir recepción final con misma clave: debe seguir siendo idempotente.

## 11. Decisiones V1 deliberadas

- Sin JSON.
- Sin salida parcial.
- Sin cancelación después de salida.
- Sin reserva de stock al PREPARAR.
- Sin FK de Transferencia hacia MovimientoInventario.
- Sin modificar StockBodega directamente.
- Sin exportar repositories/query internos.
- Una operación fallida no se borra ni se edita.
- Una devolución futura se modelará como flujo explícito, no reescribiendo
  historia física.

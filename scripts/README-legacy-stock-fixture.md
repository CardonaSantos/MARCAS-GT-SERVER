# Ensayo: ingresar Stock legacy antes del backfill a Bodega

Esta CLI **replica la antigua StockService.addStock** y es sólo para pruebas.
Escribe tres registros relacionados de forma atómica:
1. EntregaStock con total_pagado, proveedor opcional
2. EntregaStockProducto con producto/cantidad/costo
3. Stock con incremento de cantidad y costoTotal; crea si no existe

**NO** modifica Venta, VentaProducto, Pedido, Pago, StockBodega ni MovimientoInventario.
NO crea ni modifica productos o proveedores. El saldo a migrar será el de
`Stock.cantidad` DESPUÉS de registrar cualquier venta legacy de ensayo.

## Reglas de seguridad

- Sólo usar en una **copia restaurable de la base o PostgreSQL local de pruebas**.
- Nunca ejecutar contra Railway producción ni contra una réplica sincronizada de producción.
- La CLI no forma parte del arranque del servidor. El usuario debe invocarla manualmente.
- Por defecto sólo admite host PostgreSQL localhost / 127.0.0.1 / ::1.
- Requiere entorno `LEGACY_STOCK_FIXTURE_TEST=YES`, no permite `NODE_ENV=production`.
- Para una base remota exclusivamente de staging: también exige
  `LEGACY_STOCK_FIXTURE_REMOTE_TEST=YES` y `--allow-remote-test=true`.
  El operador sigue siendo responsable de comprobar que NO sea producción.
- Selecciona un producto que todavía no tenga StockBodega ni movimientos del Kardex nuevo.
- Debe existir Producto.costo válido y coincidir con el costo del ingreso. En la
  implementación legacy EntregaStock.total_pagado es INT, por lo que cantidad * costo
  debe resultar un entero sin decimales para poder registrarse.
- Proveedor opcional: `--proveedor-id=N`; exige registro existente.
- El `--run-id` identifica un **único ensayo** y crea un comprobante PENDING en
  `migration-reports/legacy-fixtures/<RUN-ID>.json` antes de escribir.
  Si se vuelve a ejecutar con el mismo ID se **rechaza una segunda escritura**.
  Si falla antes de registrar el resultado, deja el comprobante PENDING:
  **investigar manualmente antes de crear otro run-id**, pues el commit
  pudo haberse completado aunque fallase la escritura del comprobante.
  Sin conservar estos comprobantes NO se garantiza deduplicación; guardarlos.
- No es un mecanismo universal de idempotencia en PostgreSQL, dado que el esquema
  legacy no dispone de clave única para EntregaStock. Para pruebas locales, el
  bloqueo preventivo del comprobante es suficiente si se conserva intacto.

## Preparación (Windows PowerShell)

```powershell
git checkout update-requerimientos
git pull --ff-only origin update-requerimientos
npx prisma generate
$env:LEGACY_STOCK_FIXTURE_TEST="YES"
```

Verificar `DATABASE_URL` y, por separado, la identidad de la base de datos.
No hace falta una nueva migración Prisma.

Usa un producto REAL del catálogo de pruebas, por ejemplo #7. El ID es ilustrativo.

### 1. Vista previa (sin escrituras)

```powershell
npm run stock:legacy:fixture -- --mode=preview --producto-id=7 --cantidad=20 --run-id=PRUEBA001
```

Verás saldo legacy antes y después esperado, costo unitario de Producto, historial
inmutable y aviso explícito de que StockBodega no se modifica.

### 2. Aplicar ingreso legacy

```powershell
npm run stock:legacy:fixture -- --mode=apply --producto-id=7 --cantidad=20 --run-id=PRUEBA001 --confirm=ENSAYO_STOCK_LEGACY
```

Si no proporcionas `--costo-unitario`, utiliza `Producto.costo`.
Si deseas indicarlo, debe coincidir con Producto.costo para evitar valoraciones
inconsistentes al migrar. Para asociarlo a un proveedor añade `--proveedor-id=ID`.

### 3. Inspeccionar ingreso

```powershell
npm run stock:legacy:fixture -- --mode=inspect --producto-id=7 --run-id=PRUEBA001
```

Muestra Stock actual, entrada y línea registradas, saldos ANTES y DESPUÉS del ingreso.
El actual puede haber disminuido después por una venta legacy de ensayo.

### 4. Simular venta legacy (opcional)

Si tienes un mecanismo disponible para registrar una venta legacy, usa el mismo
producto y descuenta por ejemplo 3 unidades **antes** de obtener el plan de backfill.
No es necesario ejecutar ventas para probar sólo la importación.
El script fixture NO simula pagos ni crea ventas. No uses las ventas legacy en
producción después del corte.

### 5. Convertir el saldo a bodega principal

Detén el flujo legacy, comprueba que bodega #1 sea principal/activa y genera
un plan NUEVO (la salida es un JSON con datos de tu catálogo):

```powershell
npm run stock:legacy -- --mode=plan --warehouse-id=1 --file=migration-reports/backfill-prueba001.json
```

Si el producto pasó de 0 a 20 y luego se vendieron 3, en el plan debe aparecer
`READY: 17` y después de aplicar `StockBodega.real=17`. Si el producto ya
tiene StockBodega o movimientos nuevos, aparecerá excluido o se bloqueará para
revisión: NO duplicar manualmente.

Sólo después de revisar el JSON:

```powershell
npm run stock:legacy -- --mode=apply --warehouse-id=1 --file=migration-reports/backfill-prueba001.json --confirm=LEGACY_STOCK_V1
npm run stock:legacy -- --mode=verify --warehouse-id=1 --file=migration-reports/backfill-prueba001.json
```

Los modos de revertir importación y sus condiciones están documentados en
[README-legacy-stock-backfill.md](README-legacy-stock-backfill.md).

## Ejemplo de consola (ilustrativo, NO ejecutado contra tu base)

```text
--- STOCK LEGACY (ENSAYO) ---
Producto: #7 · SKU-502 · Pantalón
Stock.cantidad ANTES : 0
Ingreso propuesto     : 20
Stock.cantidad DESPUÉS: 20
Costo unitario        : Q 25.0000
StockBodega           : NO SE TOCA
Ventas y pagos        : NO SE TOCAN

--- INGRESO LEGACY CONFIRMADO ---
Ensayo ID       : PRUEBA001
EntregaStock    : #14
Stock           : #9
Ingreso         : +20 unidades
Cantidad antes  : 0
Cantidad después: 20
Costo acumulado : Q 500.00
Ventas históricas: SIN MODIFICACIONES
StockBodega     : SIN MODIFICACIONES
```

Finalizada la prueba puedes desactivar la variable de seguridad:

```powershell
Remove-Item Env:LEGACY_STOCK_FIXTURE_TEST -ErrorAction SilentlyContinue
```

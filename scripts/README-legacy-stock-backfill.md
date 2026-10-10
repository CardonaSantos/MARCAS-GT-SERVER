# Stock legacy -> Inventario v1 (Bodega principal)

## Propósito

Herramienta manual para pasar el **saldo actual de Stock.cantidad** al sistema
**StockBodega + MovimientoInventario** de una bodega principal. No reconstruye
cantidades desde el histórico de Venta: las ventas antiguas ya descontaron Stock.
No modifica Venta, VentaProducto, pagos, ingresos, Producto, Stock ni entregas legacy.

Es una operación **independiente** de prisma migrate deploy, y no se ejecuta
al desplegar Railway ni al iniciar NestJS.

## Requisitos antes de ejecutar

1. **Backup completo de PostgreSQL, restauración probada y entorno de pruebas.**
   Comprobar también qué DATABASE_URL apunta a la terminal; jamás usar la URL de producción
   para un ensayo. El script muestra si DATABASE_URL está configurada, **no identifica
   inequívocamente la base de datos**: compruébala por separado.
2. Aplicar todas las migraciones Prisma existentes. Crear la bodega principal
   desde Bodegas. El destino previsto es **id 1**, pero el script exige que
   esa bodega esté **activa y sea la única marcada esPrincipal**. Si no es id 1,
   se pasa su id con --warehouse-id; no fuerza ids ni crea bodegas.
3. Base con **exactamente una Empresa**, porque Stock legacy carece de empresaId.
4. **Cerrar todas las escrituras legacy** antes del plan, aplicación y verificaciones
   iniciales: sin ventas legacy, sin entradas de Stock ni eliminaciones. No usar el
   flujo Venta después del corte. El bloqueo transaccional protege contra otra instancia
   del script, pero NO sustituye deshabilitar los endpoints legacy.
5. No registrar entradas, reservas, salidas ni transferencias en Inventario nuevo
   para estos productos hasta finalizar el backfill/validación.
6. Verificar qué se considerará costo: se usa **Producto.costo**, no
   Stock.costoTotal / Stock.cantidad porque ese dato legacy puede estar desfasado.
   Costo null, negativo, no finito o fuera del rango permitido bloquea el producto.
   **Costo cero se admite** pero debe revisarse por contabilidad.

## Comandos PowerShell

Después de instalar dependencias y generar cliente Prisma:

    npm ci
    npx prisma generate

### 1. Plan/dry run, NINGUNA escritura de inventario

    npm run stock:legacy -- --mode=plan --warehouse-id=1 --file=migration-reports/legacy-stock-ensayo.json

Abrir el archivo JSON en un editor (no subir a Git: migration-reports está ignorado).
El reporte incluye cantidad y costo para cada producto, estado, sello SHA-256 y
huellas digitales de todo el historial Venta y VentaProducto.

Estados:

- READY: stock positivo, producto existente y sin fila StockBodega en ninguna bodega,
  costo válido. Se importará al aplicar.
- ZERO: stock legacy de 0, no se escribe movimiento.
- NEGATIVE: stock negativo/anómalo, se envía a conciliación.
- EXISTS_IN_NEW_INVENTORY: ya hay cualquier StockBodega del producto, incluso saldo 0;
  se omite para evitar inventario duplicado.
- COST_INVALID / PRODUCT_MISSING: no se puede importar con seguridad.

**Los omitidos no se incorporan**; revísalos y concílialos manualmente antes de
considerar completa la migración.

El archivo del plan no se sobrescribe: utiliza una ruta nueva para otro ensayo.

### 2. Aplicación, requiere consentimiento explícito

    npm run stock:legacy -- --mode=apply --warehouse-id=1 --file=migration-reports/legacy-stock-ensayo.json --confirm=LEGACY_STOCK_V1

La aplicación usa una transacción PostgreSQL SERIALIZABLE para **todos los candidatos**.
Si un producto falla, se revierte toda esa ejecución (no deja mitad del lote).
Durante la transacción verifica nuevamente las ventas legacy y la fotografía del
Stock origen. Nunca toca la tabla Stock original.

Cada candidato genera una fila StockBodega (real=disponible, reservada=0,
costoPromedio=Producto.costo) y un MovimientoInventario MIGRACION_INICIAL con:
clave única determinista por bodega y Stock.id, cantidad y costos antes/después,
referencia al Stock legacy y motivo del lote.

Si la misma aplicación se repite con el mismo plan, reconoce las claves existentes
y **no incrementa otra vez** los saldos. Una operación revertida no se puede
reimportar con el mismo identificador: requiere una conciliación y una versión
nueva de migración.

El límite actual de espera de la transacción es 120 s; para catálogos muy grandes
se debe preparar una estrategia por lotes y no aumentar el timeout a ciegas.

### 3. Verificación

    npm run stock:legacy -- --mode=verify --warehouse-id=1 --file=migration-reports/legacy-stock-ensayo.json

Compara los movimientos registrados, la existencia de StockBodega y las
huellas SHA-256 del historial de ventas y sus productos contra el plan.
El número de ventas y sus montos se preservan: el proceso nunca ejecuta
writes en Venta, VentaProducto o ingresos.

ADVERTENCIA: si posteriormente se hace una operación **legacy real** de venta,
el hash cambiará, aunque el script no haya modificado ventas. Interprétalo como
evidencia de que el corte de operaciones legacy no estuvo completo.

Después de verificar, consultar Kardex y existencias del inventario nuevo
y realizar una prueba de reserva/despacho. Evita activar la operación hasta que
el resultado sea consistente.

### 4. Reversión controlada (solo sin movimientos posteriores)

    npm run stock:legacy -- --mode=rollback --warehouse-id=1 --file=migration-reports/legacy-stock-ensayo.json --confirm=LEGACY_STOCK_V1

Reversión transaccional de todo el lote: sólo si cada StockBodega sigue exactamente
con cantidad inicial, reservado 0, versión 1, y sin otros movimientos de inventario.
Si existieron reservas, despachos, transferencias o ajustes, **se rechaza por completo**
y se debe conciliar manualmente.

La reversión deja StockBodega en cero y genera un MovimientoInventario
AJUSTE_SALIDA compensatorio con clave única, sin borrar el ledger ni la información
histórica. No modifica Stock original. Volver a ejecutar rollback no duplica salidas.

Una reversión transaccional no reemplaza un backup físico restaurable.

## Prueba funcional sugerida

En una base **de pruebas**:

1. Registrar una entrada legacy (por ejemplo +20 unidades).
2. Registrar venta legacy de 3 unidades; confirmar Stock.cantidad=17.
3. Guardar evidencia de Venta y VentaProducto, totales, descuentos y líneas.
4. Crear/confirmar la Bodega principal #1. Asegurarse de que no existe
   StockBodega de ese producto.
5. Detener operaciones legacy.
6. Ejecutar plan: debe indicar READY con 17 (no 20, ni 14).
7. Ejecutar apply: StockBodega.real/disponible=17, reserva=0.
8. Repetir apply: inserted=0, repeated=1 para ese producto.
9. Ejecutar verify: historial de ventas inalterado, cero problemas.
10. Ejecutar rollback **antes de utilizar esas unidades**:
    StockBodega=0, dos movimientos auditables (importación y salida), Stock=17.
11. No reimportar el mismo lote una vez revertido.
12. Si se requiere probar despacho, usar otra copia limpia del backup después de
    realizar apply. No intentar rollback después de usar el stock.

## Reglas y limitaciones

- No se migran productos ya presentes en Inventario nuevo. Incluso si el registro
  actual es cero, exige conciliación y operación supervisada por separado.
- No se efectúan movimientos de stock de otras bodegas, reservas o pedidos.
- No se asigna bodega histórica a cada entrada o venta antigua: sólo se traslada
  el saldo físico actual.
- Una primera importación no crea ventas, créditos, pagos ni alteraciones fiscales.
- El plan contiene información comercial: conservarlo privado y dentro de backups.
- Los movimientos existentes en Kardex son inmutables; rollback **compensa**,
  no elimina la historia.
- No hay integración en una pantalla web porque no debe ejecutarse
  accidentalmente desde el Dashboard o por un usuario con credenciales.
- No usar en producción hasta realizar dry run + prueba de restauración
  y conciliación de productos bloqueados.

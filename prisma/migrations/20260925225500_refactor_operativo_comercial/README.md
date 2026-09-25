# Refactor operativo/comercial — notas de despliegue

Esta migración es deliberadamente **aditiva**.

## Qué hace

- Agrega el nuevo dominio de jornada/tracking.
- Agrega bodegas, stock por bodega, reservas y movimientos auditables.
- Agrega pedidos, crédito, preparación, despacho, entrega y transporte.
- Agrega pagos, comprobantes, facturación y cuentas por cobrar.
- Amplía el enum `Rol` con `BODEGA`, `CONTABILIDAD` y `REPARTIDOR`.

## Qué NO hace

- No elimina ni renombra `Stock`, `EntregaStock`, `Venta`, `PagoCredito`, `Ubicacion` ni otras tablas legacy.
- No migra automáticamente las ubicaciones históricas.
- No mueve automáticamente el stock legacy a `StockBodega`.
- No inventa solicitudes/referencias/documentos para créditos históricos.

## Corte recomendado

1. Respaldar la base de datos.
2. Aplicar la migración estructural.
3. Verificar empresa(s), productos y cantidades reales.
4. Crear la Bodega Central correspondiente.
5. Hacer backfill controlado de `Stock` hacia `StockBodega`.
6. Validar totales por producto antes de habilitar escrituras del nuevo flujo.
7. Migrar únicamente la continuidad financiera histórica que se necesite.
8. Desplegar backend y frontend coordinadamente.
9. Mantener tablas legacy en solo lectura durante la validación.
10. Eliminar legacy únicamente en una migración posterior.

La separación del backfill evita asociar inventario global a una empresa equivocada cuando los datos productivos todavía no han sido auditados.
